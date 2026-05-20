'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, X, Trash2, ArrowDown, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePipelineStore } from '@/lib/stores';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { LogLevel } from '@/lib/types';

const LOG_COLORS: Record<LogLevel, string> = {
  info: 'text-foreground',
  warn: 'text-[#F59E0B]',
  error: 'text-[#EF4444]',
  success: 'text-[#10B981]',
  debug: 'text-muted-foreground',
};

const LOG_PREFIXES: Record<LogLevel, string> = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
  success: 'DONE',
  debug: 'DEBUG',
};

const LOG_PREFIX_COLORS: Record<LogLevel, string> = {
  info: 'text-[#8B949E]',
  warn: 'text-[#F59E0B]',
  error: 'text-[#EF4444]',
  success: 'text-[#10B981]',
  debug: 'text-[#6B7280]',
};

type LogFilter = 'all' | LogLevel;

export function CommandConsole() {
  const { logs, isConsoleOpen, setConsoleOpen, consoleHeight, setConsoleHeight, clearLogs, addLog } =
    usePipelineStore();
  const [command, setCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [autoScroll, setAutoScroll] = useState(true);
  const [logFilter, setLogFilter] = useState<LogFilter>('all');
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Filter logs
  const filteredLogs = logFilter === 'all' 
    ? logs 
    : logs.filter((log) => log.level === logFilter);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Detect manual scroll
  const handleScroll = () => {
    if (logsContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
    }
  };

  // Handle command execution
  const executeCommand = (cmd: string) => {
    if (!cmd.trim()) return;

    setCommandHistory((prev) => [...prev, cmd]);
    setHistoryIndex(-1);

    addLog({
      level: 'debug',
      message: `$ ${cmd}`,
      source: 'console',
    });

    const parts = cmd.trim().split(' ');
    const baseCmd = parts[0].toLowerCase();

    if (baseCmd === '/run-stage' || baseCmd === '/run') {
      const stageArg = parts[1];
      if (stageArg) {
        addLog({
          level: 'info',
          message: `Initiating stage: ${stageArg}`,
          source: 'system',
        });
      } else {
        addLog({
          level: 'error',
          message: 'Usage: /run-stage <stage_number|stage_name> [--options]',
          source: 'console',
        });
      }
    } else if (baseCmd === '/status') {
      addLog({
        level: 'info',
        message: 'Pipeline status: Ready',
        source: 'system',
      });
    } else if (baseCmd === '/clear') {
      clearLogs();
    } else if (baseCmd === '/help') {
      addLog({ level: 'info', message: 'Available commands:', source: 'console' });
      addLog({ level: 'info', message: '  /run-stage <n> [--lod-level 1|2]  - Run a specific pipeline stage', source: 'console' });
      addLog({ level: 'info', message: '  /status                           - Show pipeline status', source: 'console' });
      addLog({ level: 'info', message: '  /clear                            - Clear console logs', source: 'console' });
      addLog({ level: 'info', message: '  /help                             - Show this help message', source: 'console' });
    } else {
      addLog({
        level: 'error',
        message: `Unknown command: ${baseCmd}. Type /help for available commands.`,
        source: 'console',
      });
    }

    setCommand('');
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      executeCommand(command);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex =
          historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setCommand(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setCommand('');
        } else {
          setHistoryIndex(newIndex);
          setCommand(commandHistory[newIndex]);
        }
      }
    }
  };

  // Handle resize
  const handleResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = consoleHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = startY - moveEvent.clientY;
      const newHeight = Math.max(120, Math.min(window.innerHeight * 0.5, startHeight + delta));
      setConsoleHeight(newHeight);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const scrollToBottom = () => {
    setAutoScroll(true);
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="relative">
      {/* Toggle Button (always visible) */}
      <AnimatePresence>
        {!isConsoleOpen && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={() => setConsoleOpen(true)}
            className="absolute bottom-4 left-4 flex items-center gap-2 px-3 py-2 rounded-lg panel hover:bg-[#21262D] transition-colors text-[12px]"
          >
            <Terminal className="w-4 h-4 text-[#00D4FF]" />
            <span className="text-muted-foreground">Console</span>
            {logs.length > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-[#00D4FF]/10 text-[#00D4FF] text-[10px] tabular-nums">
                {logs.length}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Console Panel */}
      <AnimatePresence>
        {isConsoleOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: consoleHeight, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="bg-[#0A0D12] border-t border-border flex flex-col overflow-hidden"
            style={{ minHeight: 120, maxHeight: '50vh' }}
          >
            {/* Resize Handle */}
            <div
              onMouseDown={handleResize}
              className="h-1 cursor-ns-resize hover:bg-[#00D4FF]/30 transition-colors"
            />

            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <div className="flex items-center gap-2 text-[12px]">
                <Terminal className="w-3.5 h-3.5 text-[#00D4FF]" />
                <span className="font-medium">Console</span>
                <span className="text-muted-foreground tabular-nums">
                  {filteredLogs.length} {filteredLogs.length === 1 ? 'entry' : 'entries'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {/* Log Level Filter */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 px-2 gap-1 text-[11px]">
                      <Filter className="w-3 h-3" />
                      {logFilter === 'all' ? 'All' : LOG_PREFIXES[logFilter]}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="glass min-w-[100px]">
                    <DropdownMenuItem onClick={() => setLogFilter('all')} className="text-[12px]">
                      All
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLogFilter('info')} className="text-[12px]">
                      Info
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLogFilter('warn')} className="text-[12px] text-[#F59E0B]">
                      Warning
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLogFilter('error')} className="text-[12px] text-[#EF4444]">
                      Error
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLogFilter('debug')} className="text-[12px] text-muted-foreground">
                      Debug
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Auto-scroll toggle */}
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('w-6 h-6', autoScroll && 'text-[#00D4FF]')}
                  onClick={scrollToBottom}
                >
                  <ArrowDown className="w-3 h-3" />
                </Button>

                <Button variant="ghost" size="icon" className="w-6 h-6" onClick={clearLogs}>
                  <Trash2 className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6"
                  onClick={() => setConsoleOpen(false)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>

            {/* Logs */}
            <div
              ref={logsContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[12px] leading-relaxed"
            >
              {filteredLogs.length === 0 ? (
                <div className="text-muted-foreground py-4 text-center">
                  No logs yet. Type /help for available commands.
                </div>
              ) : (
                filteredLogs.map((log) => (
                  <div key={log.id} className="flex gap-2 py-0.5">
                    <span className="text-[#6B7280] tabular-nums shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={cn('shrink-0 w-12 font-medium', LOG_PREFIX_COLORS[log.level])}>
                      [{LOG_PREFIXES[log.level]}]
                    </span>
                    <span className="text-[#00D4FF]/70 shrink-0">
                      [{log.source}]
                    </span>
                    <span className={cn('break-all', LOG_COLORS[log.level])}>
                      {log.message}
                    </span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>

            {/* New messages indicator */}
            {!autoScroll && logs.length > 0 && (
              <button
                onClick={scrollToBottom}
                className="absolute bottom-14 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[#00D4FF]/10 text-[#00D4FF] text-[11px] border border-[#00D4FF]/30 hover:bg-[#00D4FF]/20 transition-colors"
              >
                <ArrowDown className="w-3 h-3 inline mr-1" />
                New messages
              </button>
            )}

            {/* Input */}
            <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
              <span className="text-[#00D4FF] text-[12px] font-mono">$</span>
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a command... (/help for options)"
                className="flex-1 bg-transparent text-[12px] font-mono outline-none placeholder:text-muted-foreground/50"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
