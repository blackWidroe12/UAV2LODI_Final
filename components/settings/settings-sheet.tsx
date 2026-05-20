'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Settings,
  X,
  Zap,
  Database,
  MapPin,
  ChevronDown,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/lib/stores';
import type { Tier1Settings } from '@/lib/settings-config';
import {
  DEFAULT_TIER1_SETTINGS,
  QUALITY_PRESETS,
  CRS_OPTIONS,
  DISPLAY_FORMATS,
  VERTICAL_DATUMS,
  CSV_FORMATS,
  COORDINATE_ORDERS,
  CPU_THREAD_OPTIONS,
  MEMORY_ALLOCATION_OPTIONS,
} from '@/lib/settings-config';

interface SettingsSheetProps {
  trigger?: React.ReactNode;
}

export function SettingsSheet({ trigger }: SettingsSheetProps) {
  const { activeProject, updateProject } = useProjectStore();
  const [open, setOpen] = useState(false);
  
  // Initialize settings from project or use defaults
  const currentSettings: Tier1Settings = activeProject?.settings || DEFAULT_TIER1_SETTINGS;

  const updateSettings = (key: keyof Tier1Settings, value: any) => {
    if (activeProject) {
      updateProject({
        settings: {
          ...currentSettings,
          [key]: value,
        },
      });
    }
  };

  const updateNestedSetting = (category: keyof Tier1Settings, key: string, value: any) => {
    if (activeProject) {
      updateProject({
        settings: {
          ...currentSettings,
          [category]: {
            ...currentSettings[category],
            [key]: value,
          },
        },
      });
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" className="w-8 h-8">
            <Settings className="w-4 h-4" />
          </Button>
        )}
      </SheetTrigger>

      <SheetContent side="right" className="w-full sm:w-[450px] p-0 glass">
        <div className="h-full flex flex-col">
          {/* Header */}
          <SheetHeader className="border-b border-border px-6 py-4 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#00D4FF]/10 flex items-center justify-center">
                  <Settings className="w-4 h-4 text-[#00D4FF]" />
                </div>
                <div>
                  <SheetTitle className="text-[15px]">Settings</SheetTitle>
                  <SheetDescription className="text-[12px]">
                    Tier 1 Essential Configuration
                  </SheetDescription>
                </div>
              </div>
            </div>
          </SheetHeader>

          {/* Settings Sections - Scrollable */}
          <ScrollArea className="flex-1">
            <div className="px-6 py-4 space-y-6">
              {/* 1. Processing Configuration */}
              <SettingsSection
                icon={Zap}
                title="Processing Configuration"
                description="Global defaults for all pipeline stages"
              >
                {/* Quality Preset */}
                <SettingField label="Quality Preset">
                  <div className="space-y-2">
                    {QUALITY_PRESETS.map((preset) => (
                      <label
                        key={preset.value}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-transparent hover:border-border hover:bg-[#21262D] cursor-pointer transition-colors"
                      >
                        <input
                          type="radio"
                          name="quality-preset"
                          value={preset.value}
                          checked={currentSettings.processing.qualityPreset === preset.value}
                          onChange={(e) =>
                            updateNestedSetting('processing', 'qualityPreset', e.target.value)
                          }
                          className="w-4 h-4 accent-[#00D4FF]"
                        />
                        <div className="flex-1">
                          <p className="text-[13px] font-medium text-foreground">
                            {preset.label}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {preset.description}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </SettingField>

                {/* GPU Acceleration */}
                <SettingField label="GPU Acceleration" description="Enable CUDA/OpenCL processing">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={currentSettings.processing.gpuAcceleration}
                      onCheckedChange={(checked) =>
                        updateNestedSetting('processing', 'gpuAcceleration', checked)
                      }
                      className="data-[state=checked]:bg-[#00D4FF]"
                    />
                    <span className="text-[13px] text-muted-foreground">
                      {currentSettings.processing.gpuAcceleration ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </SettingField>

                {/* Max Memory */}
                <SettingField label="Max Memory Allocation">
                  <div className="space-y-2">
                    <select
                      value={currentSettings.processing.maxMemoryGb}
                      onChange={(e) =>
                        updateNestedSetting('processing', 'maxMemoryGb', parseInt(e.target.value))
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[#21262D] border border-[#30363D] text-[13px] text-foreground focus:border-[#00D4FF] focus:outline-none"
                    >
                      {MEMORY_ALLOCATION_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground">
                      Current: {currentSettings.processing.maxMemoryGb} GB
                    </p>
                  </div>
                </SettingField>

                {/* CPU Threads */}
                <SettingField label="CPU Thread Count">
                  <div className="space-y-2">
                    <select
                      value={
                        currentSettings.processing.cpuThreads === 'auto'
                          ? 'auto'
                          : String(currentSettings.processing.cpuThreads)
                      }
                      onChange={(e) => {
                        const val = e.target.value === 'auto' ? 'auto' : parseInt(e.target.value);
                        updateNestedSetting('processing', 'cpuThreads', val);
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-[#21262D] border border-[#30363D] text-[13px] text-foreground focus:border-[#00D4FF] focus:outline-none"
                    >
                      {CPU_THREAD_OPTIONS.map((opt) => (
                        <option
                          key={opt.value}
                          value={typeof opt.value === 'string' ? opt.value : opt.value}
                        >
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </SettingField>
              </SettingsSection>

              {/* 2. Coordinate Reference System */}
              <SettingsSection
                icon={MapPin}
                title="Coordinate Reference System"
                description="Default CRS and display preferences"
              >
                {/* Default CRS */}
                <SettingField label="Default Project CRS">
                  <div className="space-y-2">
                    {CRS_OPTIONS.map((crs) => (
                      <label
                        key={crs.value}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-transparent hover:border-border hover:bg-[#21262D] cursor-pointer transition-colors"
                      >
                        <input
                          type="radio"
                          name="default-crs"
                          value={crs.value}
                          checked={currentSettings.crs.defaultCrs === crs.value}
                          onChange={(e) =>
                            updateNestedSetting('crs', 'defaultCrs', e.target.value)
                          }
                          className="w-4 h-4 accent-[#00D4FF]"
                        />
                        <div className="flex-1">
                          <p className="text-[13px] font-medium text-foreground">{crs.label}</p>
                          <p className="text-[11px] text-muted-foreground">{crs.region}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </SettingField>

                {/* Coordinate Display Format */}
                <SettingField label="Coordinate Display Format">
                  <div className="space-y-2">
                    {DISPLAY_FORMATS.map((fmt) => (
                      <label
                        key={fmt.value}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-transparent hover:border-border hover:bg-[#21262D] cursor-pointer transition-colors"
                      >
                        <input
                          type="radio"
                          name="display-format"
                          value={fmt.value}
                          checked={currentSettings.crs.displayFormat === fmt.value}
                          onChange={(e) =>
                            updateNestedSetting('crs', 'displayFormat', e.target.value)
                          }
                          className="w-4 h-4 accent-[#00D4FF]"
                        />
                        <div className="flex-1">
                          <p className="text-[13px] font-medium text-foreground">{fmt.label}</p>
                          <p className="text-[11px] text-muted-foreground font-mono">
                            {fmt.example}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </SettingField>

                {/* Vertical Datum */}
                <SettingField label="Vertical Datum">
                  <div className="space-y-2">
                    {VERTICAL_DATUMS.map((datum) => (
                      <label
                        key={datum.value}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-transparent hover:border-border hover:bg-[#21262D] cursor-pointer transition-colors"
                      >
                        <input
                          type="radio"
                          name="vertical-datum"
                          value={datum.value}
                          checked={currentSettings.crs.verticalDatum === datum.value}
                          onChange={(e) =>
                            updateNestedSetting('crs', 'verticalDatum', e.target.value)
                          }
                          className="w-4 h-4 accent-[#00D4FF]"
                        />
                        <p className="text-[13px] font-medium text-foreground">{datum.label}</p>
                      </label>
                    ))}
                  </div>
                </SettingField>
              </SettingsSection>

              {/* 3. GCP Import Settings */}
              <SettingsSection
                icon={Database}
                title="GCP Import Settings"
                description="Ground Control Point configuration"
              >
                {/* CSV Format */}
                <SettingField label="Default CSV Format">
                  <div className="space-y-2">
                    {CSV_FORMATS.map((fmt) => (
                      <label
                        key={fmt.value}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-transparent hover:border-border hover:bg-[#21262D] cursor-pointer transition-colors"
                      >
                        <input
                          type="radio"
                          name="csv-format"
                          value={fmt.value}
                          checked={currentSettings.gcpImport.csvFormat === fmt.value}
                          onChange={(e) =>
                            updateNestedSetting('gcpImport', 'csvFormat', e.target.value)
                          }
                          className="w-4 h-4 accent-[#00D4FF]"
                        />
                        <div className="flex-1">
                          <p className="text-[13px] font-medium text-foreground">{fmt.label}</p>
                          <p className="text-[11px] text-muted-foreground font-mono">
                            {fmt.example}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </SettingField>

                {/* Coordinate Order */}
                <SettingField label="Coordinate Order">
                  <div className="space-y-2">
                    {COORDINATE_ORDERS.map((order) => (
                      <label
                        key={order.value}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-transparent hover:border-border hover:bg-[#21262D] cursor-pointer transition-colors"
                      >
                        <input
                          type="radio"
                          name="coord-order"
                          value={order.value}
                          checked={currentSettings.gcpImport.coordinateOrder === order.value}
                          onChange={(e) =>
                            updateNestedSetting('gcpImport', 'coordinateOrder', e.target.value)
                          }
                          className="w-4 h-4 accent-[#00D4FF]"
                        />
                        <p className="text-[13px] font-medium text-foreground">{order.label}</p>
                      </label>
                    ))}
                  </div>
                </SettingField>

                {/* Accuracy Threshold */}
                <SettingField label="Accuracy Threshold Warning (meters)">
                  <div className="space-y-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={currentSettings.gcpImport.accuracyThresholdMeters}
                      onChange={(e) =>
                        updateNestedSetting(
                          'gcpImport',
                          'accuracyThresholdMeters',
                          parseFloat(e.target.value)
                        )
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[#21262D] border border-[#30363D] text-[13px] text-foreground focus:border-[#00D4FF] focus:outline-none"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      RMSE values above this will trigger warnings
                    </p>
                  </div>
                </SettingField>
              </SettingsSection>
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="border-t border-border px-6 py-4 shrink-0 flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              className="border-[#30363D] hover:bg-[#21262D]"
            >
              Close
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: any;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-[#00D4FF]/10 flex items-center justify-center">
          <Icon className="w-3 h-3 text-[#00D4FF]" />
        </div>
        <div>
          <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
          {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="space-y-3 pl-7">{children}</div>
    </div>
  );
}

function SettingField({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] font-medium text-foreground block">{label}</label>
      {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
      {children}
    </div>
  );
}
