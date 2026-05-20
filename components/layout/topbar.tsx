'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Play,
  Pause,
  Bell,
  User,
  LogOut,
  HelpCircle,
  Layers,
  Pencil,
  Check,
  X,
  ChevronDown,
  Globe,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useAuthStore, useProjectStore, usePipelineStore, useUIStore } from '@/lib/stores';
import { SettingsSheet } from '@/components/settings/settings-sheet';

const CRS_OPTIONS = [
  { value: 'EPSG:32736', label: 'UTM 36S' },
  { value: 'EPSG:32735', label: 'UTM 35S' },
  { value: 'EPSG:4326', label: 'WGS 84' },
  { value: 'Lo33', label: 'Lo 33' },
];

export function Topbar() {
  const { user, logout } = useAuthStore();
  const { activeProject, updateProject } = useProjectStore();
  const { isGlobalRunning, setGlobalRunning, runMode, setRunMode } = usePipelineStore();
  const { setShowGhostRun, setCurrentView } = useUIStore();
  
  const [isEditingName, setIsEditingName] = useState(false);
  const [projectName, setProjectName] = useState(activeProject?.name || '');
  const [isHoveringName, setIsHoveringName] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingName && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingName]);

  const handleNameSubmit = () => {
    if (projectName.trim() && activeProject) {
      updateProject({ name: projectName.trim() });
    }
    setIsEditingName(false);
  };

  const handleNameCancel = () => {
    setProjectName(activeProject?.name || '');
    setIsEditingName(false);
  };

  const handleCRSChange = (newCRS: string) => {
    if (activeProject) {
      updateProject({ crs: newCRS });
    }
  };

  const handleRunAll = () => {
    if (!isGlobalRunning) {
      setShowGhostRun(true);
    }
    setGlobalRunning(!isGlobalRunning);
  };

  const handleLogoClick = () => {
    setCurrentView('hangar');
  };

  const userInitials = user
    ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase()
    : 'U';

  return (
    <header className="h-[52px] border-b border-border bg-[#161B22] flex items-center justify-between px-4 gap-4">
      {/* Left: Logo & Project Name */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Logo - clickable to go back to hangar */}
        <button
          onClick={handleLogoClick}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity shrink-0"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00D4FF] to-[#8B5CF6] flex items-center justify-center">
            <Layers className="w-4 h-4 text-[#0E1117]" />
          </div>
          <span className="font-display font-semibold text-[13px] hidden lg:inline text-foreground">
            UAV2LoD1
          </span>
        </button>

        {/* Project Name (Editable) */}
        {activeProject && (
          <div className="flex items-center gap-2 border-l border-border pl-3 min-w-0">
            {isEditingName ? (
              <div className="flex items-center gap-1">
                <input
                  ref={inputRef}
                  type="text"
                  title="Project name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNameSubmit();
                    if (e.key === 'Escape') handleNameCancel();
                  }}
                  className="bg-[#21262D] border border-[#00D4FF]/50 rounded px-2 py-1 text-[13px] font-medium outline-none focus:border-[#00D4FF] w-48"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="w-6 h-6 text-[#10B981] hover:text-[#10B981] hover:bg-[#10B981]/10"
                  onClick={handleNameSubmit}
                >
                  <Check className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="w-6 h-6 text-muted-foreground hover:text-foreground"
                  onClick={handleNameCancel}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setProjectName(activeProject.name);
                  setIsEditingName(true);
                }}
                onMouseEnter={() => setIsHoveringName(true)}
                onMouseLeave={() => setIsHoveringName(false)}
                className="flex items-center gap-1.5 text-[13px] font-medium text-foreground hover:text-[#00D4FF] transition-colors truncate max-w-[200px]"
              >
                <span className="truncate">{activeProject.name}</span>
                <Pencil
                  className={cn(
                    'w-3 h-3 transition-opacity shrink-0',
                    isHoveringName ? 'opacity-100' : 'opacity-0'
                  )}
                />
              </button>
            )}

            {/* CRS Badge - Popover selector */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-[#21262D] text-muted-foreground hover:text-foreground hover:bg-[#30363D] transition-colors shrink-0">
                  <Globe className="w-3 h-3" />
                  <span>{activeProject.crs}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-40 p-1 glass" align="start">
                {CRS_OPTIONS.map((crs) => (
                  <button
                    key={crs.value}
                    onClick={() => handleCRSChange(crs.value)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-[12px] rounded hover:bg-[#21262D] transition-colors',
                      activeProject.crs === crs.value && 'text-[#00D4FF] bg-[#00D4FF]/5'
                    )}
                  >
                    {crs.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      {/* Center: Run Controls - grouped in a pill */}
      {activeProject && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-[#0E1117]">
          {/* Run Mode Toggle */}
          <div className="flex items-center gap-2 text-[11px]">
            <span
              className={cn(
                'transition-colors',
                runMode === 'stage-by-stage' ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              Stage
            </span>
            <Switch
              checked={runMode === 'sequential'}
              onCheckedChange={(checked) =>
                setRunMode(checked ? 'sequential' : 'stage-by-stage')
              }
              className="h-4 w-7 data-[state=checked]:bg-[#00D4FF]"
            />
            <span
              className={cn(
                'transition-colors',
                runMode === 'sequential' ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              Auto
            </span>
          </div>

          <div className="w-px h-4 bg-border" />

          {/* Run All Button */}
          <motion.div
            animate={isGlobalRunning ? { scale: [1, 1.02, 1] } : {}}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            <Button
              onClick={handleRunAll}
              size="sm"
              className={cn(
                'h-7 gap-1.5 text-[11px] font-medium rounded-full px-3',
                isGlobalRunning
                  ? 'bg-[#F59E0B] hover:bg-[#F59E0B]/90 text-[#0E1117]'
                  : 'bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-[#0E1117] glow-cyan'
              )}
            >
              {isGlobalRunning ? (
                <>
                  <Pause className="w-3 h-3" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="w-3 h-3" />
                  Run All
                </>
              )}
            </Button>
          </motion.div>
        </div>
      )}

      {/* Right: User & Settings */}
      <div className="flex items-center gap-1">
        {/* Ghost Run Preview */}
        {activeProject && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-[11px] text-muted-foreground hover:text-[#00D4FF] hover:bg-[#00D4FF]/5"
            onClick={() => setShowGhostRun(true)}
          >
            <Zap className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Ghost</span>
          </Button>
        )}

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="w-8 h-8 relative">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#00D4FF] rounded-full" />
        </Button>

        {/* Settings */}
        <SettingsSheet />

        {/* User Menu - Avatar only, name in dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full p-0">
              <Avatar className="w-7 h-7">
                <AvatarImage src={user?.avatarUrl || undefined} alt={user?.username} />
                <AvatarFallback className="bg-[#21262D] text-[10px] font-medium">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 glass">
            {/* User info header */}
            <div className="px-3 py-2 border-b border-border">
              <p className="text-[13px] font-medium">{user?.firstName} {user?.lastName}</p>
              <p className="text-[11px] text-muted-foreground">{user?.email}</p>
            </div>
            <DropdownMenuItem className="gap-2 text-[13px]">
              <User className="w-4 h-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 text-[13px]">
              <HelpCircle className="w-4 h-4" />
              Help & Docs
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 text-[13px] text-[#EF4444] focus:text-[#EF4444]"
              onClick={() => logout()}
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
