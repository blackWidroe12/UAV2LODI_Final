"""
Stage 5 - LoD1 Model Extrusion & Export
Dagster asset: lod1_models

This asset extrudes building footprints to 3D LoD1 models and exports
in various formats (CityJSON, GeoPackage, QGIS project).
"""

import json
import logging
import zipfile
from pathlib import Path
from typing import Optional
from datetime import datetime

import numpy as np
import geopandas as gpd
from shapely.geometry import Polygon, mapping
from dagster import asset, AssetExecutionContext, AssetIn

logger = logging.getLogger(__name__)


def create_cityjson_model(
    gdf: gpd.GeoDataFrame,
    output_path: Path,
    project_name: str,
    crs: str,
) -> Path:
    """
    Create CityJSON LoD1 building models from attributed footprints.
    
    Args:
        gdf: GeoDataFrame with footprints and height attributes
        output_path: Path for CityJSON output
        project_name: Project name for metadata
        crs: Coordinate reference system
        
    Returns:
        Path to CityJSON file
    """
    logger.info("Creating CityJSON model")
    
    # CityJSON structure
    cityjson = {
        "type": "CityJSON",
        "version": "1.1",
        "transform": {
            "scale": [0.001, 0.001, 0.001],
            "translate": [0.0, 0.0, 0.0],
        },
        "metadata": {
            "identifier": project_name,
            "referenceDate": datetime.now().strftime("%Y-%m-%d"),
            "referenceSystem": f"https://www.opengis.net/def/crs/EPSG/0/{crs.split(':')[1]}",
        },
        "CityObjects": {},
        "vertices": [],
    }
    
    # Get bounding box for transform
    bounds = gdf.total_bounds
    cityjson["transform"]["translate"] = [float(bounds[0]), float(bounds[1]), 0.0]
    
    vertices = []
    vertex_lookup = {}
    
    def add_vertex(x: float, y: float, z: float) -> int:
        """Add vertex and return index, reusing existing vertices."""
        # Transform to integer coordinates
        tx = int((x - cityjson["transform"]["translate"][0]) / cityjson["transform"]["scale"][0])
        ty = int((y - cityjson["transform"]["translate"][1]) / cityjson["transform"]["scale"][1])
        tz = int((z - cityjson["transform"]["translate"][2]) / cityjson["transform"]["scale"][2])
        
        key = (tx, ty, tz)
        if key not in vertex_lookup:
            vertex_lookup[key] = len(vertices)
            vertices.append([tx, ty, tz])
        return vertex_lookup[key]
    
    # Create building objects
    for idx, row in gdf.iterrows():
        building_id = f"Building_{row.get('building_id', idx)}"
        height = row.get("mean_height", 5.0)
        
        geom = row.geometry
        if not isinstance(geom, Polygon):
            continue
        
        # Get exterior ring coordinates
        coords = list(geom.exterior.coords)
        if len(coords) < 4:
            continue
        
        # Remove closing coordinate if present
        if coords[0] == coords[-1]:
            coords = coords[:-1]
        
        # Create ground and roof faces
        ground_vertices = []
        roof_vertices = []
        
        for x, y in coords:
            ground_vertices.append(add_vertex(x, y, 0))
            roof_vertices.append(add_vertex(x, y, height))
        
        # Build solid geometry (surfaces)
        surfaces = []
        
        # Ground face (reversed for outward normal)
        surfaces.append([ground_vertices[::-1]])
        
        # Roof face
        surfaces.append([roof_vertices])
        
        # Wall faces
        n = len(coords)
        for i in range(n):
            j = (i + 1) % n
            wall = [
                [
                    ground_vertices[i],
                    ground_vertices[j],
                    roof_vertices[j],
                    roof_vertices[i],
                ]
            ]
            surfaces.append(wall)
        
        # Create CityObject
        city_object = {
            "type": "Building",
            "attributes": {
                "measuredHeight": float(height),
                "area_sqm": float(row.get("area_sqm", 0)),
            },
            "geometry": [
                {
                    "type": "Solid",
                    "lod": "1",
                    "boundaries": [surfaces],
                }
            ],
        }
        
        cityjson["CityObjects"][building_id] = city_object
    
    cityjson["vertices"] = vertices
    
    # Save
    with open(output_path, "w") as f:
        json.dump(cityjson, f, indent=2)
    
    logger.info(f"CityJSON saved to {output_path}")
    return output_path


def create_3d_geopackage(
    gdf: gpd.GeoDataFrame,
    output_path: Path,
) -> Path:
    """
    Create GeoPackage with 3D attributes (height column for visualization).
    
    Note: True 3D polygons require PolygonZ support which depends on GDAL/GEOS version.
    This creates a 2D footprint with height attributes for compatibility.
    
    Args:
        gdf: GeoDataFrame with footprints and height attributes
        output_path: Path for GeoPackage output
        
    Returns:
        Path to GeoPackage
    """
    logger.info("Creating 3D GeoPackage")
    
    # Ensure height column exists
    if "mean_height" not in gdf.columns:
        gdf["mean_height"] = 5.0
    
    # Add base elevation column (assumed ground level)
    gdf["base_elevation"] = 0.0
    
    # Add LoD1 specific columns
    gdf["roof_elevation"] = gdf["base_elevation"] + gdf["mean_height"]
    gdf["lod"] = "LoD1"
    
    # Save
    gdf.to_file(output_path, driver="GPKG")
    
    logger.info(f"GeoPackage saved to {output_path}")
    return output_path


def create_qgis_project(
    output_dir: Path,
    ortho_path: Optional[Path],
    footprints_path: Path,
    ndsm_path: Optional[Path],
    project_name: str,
) -> Path:
    """
    Create a QGIS project file with 3D extrusion symbology.
    
    Args:
        output_dir: Output directory
        ortho_path: Path to orthophoto for basemap
        footprints_path: Path to building footprints
        ndsm_path: Path to nDSM for terrain
        project_name: Project name
        
    Returns:
        Path to QGIS project file
    """
    logger.info("Creating QGIS project file")
    
    project_path = output_dir / f"{project_name}.qgz"
    
    # Create a simple QGIS project XML
    qgs_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<qgis version="3.28" projectname="{project_name}">
  <title>{project_name} - LoD1 Building Models</title>
  <projectlayers>
    <maplayer type="raster" name="Orthophoto">
      <datasource>{ortho_path or ''}</datasource>
    </maplayer>
    <maplayer type="vector" name="Building Footprints">
      <datasource>{footprints_path}</datasource>
      <renderer-3d type="polygon">
        <extrusion height="mean_height"/>
      </renderer-3d>
    </maplayer>
  </projectlayers>
  <properties>
    <LoD1_Export>
      <generated_by>UAV2LoD1 Pipeline</generated_by>
      <generation_date>{datetime.now().isoformat()}</generation_date>
    </LoD1_Export>
  </properties>
</qgis>'''
    
    # Save as .qgs (uncompressed) for simplicity
    qgs_path = output_dir / f"{project_name}.qgs"
    with open(qgs_path, "w") as f:
        f.write(qgs_content)
    
    logger.info(f"QGIS project saved to {qgs_path}")
    return qgs_path


def create_obj_model(
    gdf: gpd.GeoDataFrame,
    output_path: Path,
) -> Path:
    """
    Create OBJ 3D model for visualization.
    
    Args:
        gdf: GeoDataFrame with footprints and height attributes
        output_path: Path for OBJ output
        
    Returns:
        Path to OBJ file
    """
    logger.info("Creating OBJ model")
    
    try:
        import trimesh
        
        meshes = []
        
        for idx, row in gdf.iterrows():
            height = row.get("mean_height", 5.0)
            geom = row.geometry
            
            if not isinstance(geom, Polygon):
                continue
            
            # Get exterior ring
            coords = np.array(list(geom.exterior.coords))
            if len(coords) < 4:
                continue
            
            # Remove duplicate closing vertex
            if np.allclose(coords[0], coords[-1]):
                coords = coords[:-1]
            
            # Create prism mesh
            # Get centroid for local coordinates
            centroid = geom.centroid
            cx, cy = centroid.x, centroid.y
            
            # Create 2D polygon path
            path_2d = coords[:, :2] - [cx, cy]
            
            # Extrude to 3D
            from trimesh.creation import extrude_polygon
            from shapely.geometry import Polygon as ShapelyPolygon
            
            poly_2d = ShapelyPolygon(path_2d)
            
            if poly_2d.is_valid and not poly_2d.is_empty:
                mesh = extrude_polygon(poly_2d, height)
                
                # Translate to world position
                mesh.apply_translation([cx, cy, 0])
                meshes.append(mesh)
        
        if meshes:
            combined = trimesh.util.concatenate(meshes)
            combined.export(output_path)
            logger.info(f"OBJ model saved to {output_path}")
        else:
            # Create empty file
            with open(output_path, "w") as f:
                f.write("# Empty OBJ - no valid buildings\n")
            logger.warning("No valid buildings for OBJ export")
        
        return output_path
        
    except ImportError:
        logger.warning("trimesh not available, skipping OBJ export")
        with open(output_path, "w") as f:
            f.write("# OBJ export requires trimesh library\n")
        return output_path


def create_export_package(
    output_dir: Path,
    files: list[Path],
    package_name: str,
) -> Path:
    """
    Create ZIP package of all export files.
    
    Args:
        output_dir: Output directory
        files: List of files to include
        package_name: Name for ZIP file
        
    Returns:
        Path to ZIP file
    """
    logger.info("Creating export package")
    
    zip_path = output_dir / f"{package_name}_exports.zip"
    
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for file_path in files:
            if file_path.exists():
                zf.write(file_path, file_path.name)
    
    logger.info(f"Export package saved to {zip_path}")
    return zip_path


@asset(
    description="Extrude footprints to LoD1 3D models and export in multiple formats",
    ins={
        "project_config": AssetIn(),
        "attributed_footprints": AssetIn(),
        "coregistered": AssetIn(),
    },
    compute_kind="3d_modeling",
    group_name="export",
)
def lod1_models(
    context: AssetExecutionContext,
    project_config: dict,
    attributed_footprints: dict,
    coregistered: dict,
) -> dict:
    """
    Dagster asset that creates LoD1 3D building models from attributed footprints.
    
    Exports:
    - CityJSON: Standard 3D city model format
    - GeoPackage: 2D footprints with height attributes
    - QGIS Project: Ready-to-use visualization project
    - OBJ: 3D mesh for visualization software
    - ZIP: Package of all exports
    
    Args:
        context: Dagster execution context
        project_config: Configuration from project_config asset
        attributed_footprints: Outputs from attributed_footprints asset
        coregistered: Outputs from coregistered asset
        
    Returns:
        Dictionary containing paths to exports
    """
    config = project_config["config"]
    output_dir = Path(project_config["directories"]["outputs"])
    project_name = config["project_name"]
    crs = config.get("output_crs", "EPSG:32736")
    
    footprints_path = Path(attributed_footprints["footprints_path"])
    ortho_path = Path(coregistered["ortho_balanced_path"])
    ndsm_path = Path(attributed_footprints.get("ndsm_filtered_path", ""))
    
    context.log.info("Starting LoD1 model export")
    
    # Load footprints
    gdf = gpd.read_file(footprints_path)
    num_buildings = len(gdf)
    
    if num_buildings == 0:
        context.log.warning("No buildings to export")
    
    context.log.info(f"Exporting {num_buildings} buildings")
    
    export_files = []
    
    # Create CityJSON
    cityjson_path = output_dir / "lod1_models.city.json"
    create_cityjson_model(gdf, cityjson_path, project_name, crs)
    export_files.append(cityjson_path)
    context.log.info("CityJSON export complete")
    
    # Create 3D GeoPackage
    gpkg_3d_path = output_dir / "lod1_models.gpkg"
    create_3d_geopackage(gdf, gpkg_3d_path)
    export_files.append(gpkg_3d_path)
    context.log.info("GeoPackage export complete")
    
    # Create QGIS project
    qgis_path = create_qgis_project(
        output_dir,
        ortho_path if ortho_path.exists() else None,
        gpkg_3d_path,
        ndsm_path if ndsm_path.exists() else None,
        project_name,
    )
    export_files.append(qgis_path)
    context.log.info("QGIS project created")
    
    # Create OBJ model
    obj_path = output_dir / "lod1_models.obj"
    create_obj_model(gdf, obj_path)
    export_files.append(obj_path)
    context.log.info("OBJ export complete")
    
    # Create ZIP package
    zip_path = create_export_package(output_dir, export_files, project_name)
    
    # Calculate statistics
    if num_buildings > 0:
        total_volume = (gdf["area_sqm"] * gdf["mean_height"]).sum()
        avg_height = gdf["mean_height"].mean()
    else:
        total_volume = avg_height = 0
    
    result = {
        "cityjson_path": str(cityjson_path),
        "geopackage_path": str(gpkg_3d_path),
        "qgis_project_path": str(qgis_path),
        "obj_path": str(obj_path),
        "zip_path": str(zip_path),
        "metrics": {
            "num_buildings": num_buildings,
            "total_volume_m3": float(total_volume),
            "average_height_m": float(avg_height),
            "formats_exported": ["CityJSON", "GeoPackage", "QGIS", "OBJ"],
        },
    }
    
    context.add_output_metadata({
        "num_buildings": num_buildings,
        "total_volume_m3": round(total_volume, 2),
        "average_height_m": round(avg_height, 2),
        "cityjson_path": str(cityjson_path),
        "geopackage_path": str(gpkg_3d_path),
        "zip_path": str(zip_path),
    })
    
    return result
