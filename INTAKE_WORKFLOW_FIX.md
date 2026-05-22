# Intake Workflow Fix - Implementation Verification

## Summary of Changes

### 1. API Endpoint Enhancement
**File:** `app/api/projects/route.ts`

Added a "list-images" action to the POST /projects endpoint:
- Accepts: `{ action: 'list-images', projectId: string }`
- Returns: `{ success: true, data: { images: string[], count: number, directory: string } }`
- Security: Validates path (no path traversal), verifies directory exists, confirms user owns project
- Filters: Only returns .jpg, .jpeg, .png, .tiff, .tif, .dng, .raw, .arw, .cr2, .nef files

### 2. Intake Stage Component Updates
**File:** `components/stages/intake-stage.tsx`

**Changes:**
- Removed: Manual directory path input/save UI (kept disabled button for backward compat)
- Added: `isLoadingImages` state for loading indicator
- Added: `loadedImageList` state to store image filenames
- Added: useEffect hook to auto-load images when `activeProject.directoryPath` changes
- Updated: `displayImages` derives from `loadedImageList` instead of `droneImages`
- Updated: Automatic loading on component mount and when project directory changes

**Data Flow:**
```
activeProject.directoryPath (from DB)
    ↓
useEffect triggers
    ↓
POST /api/projects?action=list-images&projectId=X
    ↓
loadedImageList = [image1.jpg, image2.jpg, ...]
    ↓
displayImages = loadedImageList.map(name => ImageFile)
    ↓
ImageGrid displays images
```

## Key Features

✅ **Single Directory Selection**
- Users select image directory ONLY during project creation
- Directory is persisted to project.directoryPath in database
- Intake stage automatically uses stored directory

✅ **No Redundant Selection**
- Intake stage no longer prompts for directory
- Images are automatically loaded on stage open
- Directory info displayed as read-only reference

✅ **Persistence Across Navigation**
- Project directory stored in database
- Survives page refresh (fetched from DB on project load)
- Survives logout/login cycle

✅ **Error Handling**
- Missing directory → shows error message
- Invalid path → API returns error with details
- Network errors → logged to console

## Testing Checklist

- [ ] Create new project with image directory → project saved with directoryPath
- [ ] Open Intake stage → images auto-load from stored directory
- [ ] No directory picker shown → read-only directory display only
- [ ] Directory persists → navigate away and back → same directory shown
- [ ] Logout/login → project opened → images still load from stored directory
- [ ] Empty directory → shows "no images" message
- [ ] Invalid path → shows error message
- [ ] Supported formats loaded → .jpg, .png, .tiff, etc. shown

## Implementation Notes

1. **Backward Compatibility**
   - Old `droneImages` from project creation is no longer used in Intake
   - Pipeline store still receives images for other stages if needed
   - Old UI elements disabled but present to avoid breaking other code

2. **Security**
   - Path traversal prevented via `path.normalize()` and `..` check
   - User ownership verified before listing images
   - All paths normalized and validated

3. **Performance**
   - Images loaded once on component mount
   - Cached in state until project changes
   - No unnecessary refetches

4. **Future Improvements**
   - Could add paginated image list for large directories
   - Could cache thumbnails server-side
   - Could add image preview on hover
   - Could support subdirectories (currently not implemented)
