'use client';

import { usePipelineStore } from '@/lib/stores';
import { DiagnosticStage } from './diagnostic-stage';
import { IntakeStage } from './intake-stage';
import { SfMStage } from './sfm-stage';
import { ValidationStage } from './validation-stage';
import { ExportStage } from './export-stage';
import { GenericStage } from './generic-stage';

export function StageRouter() {
  const { activeStageId } = usePipelineStore();

  switch (activeStageId) {
    case 'diagnostic':
      return <DiagnosticStage />;
    case 'intake':
      return <IntakeStage />;
    case 'sfm':
      return <SfMStage />;
    case 'dense_cloud':
      return <GenericStage stageId="dense_cloud" />;
    case 'dsm_dtm':
      return <GenericStage stageId="dsm_dtm" />;
    case 'segmentation':
      return <GenericStage stageId="segmentation" />;
    case 'lod_modeling':
      return <GenericStage stageId="lod_modeling" />;
    case 'validation':
      return <ValidationStage />;
    case 'analytics':
      return <GenericStage stageId="analytics" />;
    case 'export':
      return <ExportStage />;
    default:
      return <DiagnosticStage />;
  }
}
