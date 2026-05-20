'use client';

import { Suspense } from 'react';
import { motion } from 'framer-motion';
import { DroneScene } from './drone-scene';
import { AuthForms } from './auth-forms';
import { Loader2 } from 'lucide-react';

function SceneLoader() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Loading 3D scene...</p>
      </div>
    </div>
  );
}

export function AuthPage() {
  return (
    <div className="min-h-screen flex">
      {/* Left: 3D Drone Scene */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="hidden lg:block lg:w-1/2 xl:w-3/5 relative overflow-hidden"
      >
        <Suspense fallback={<SceneLoader />}>
          <DroneScene />
        </Suspense>

        {/* Tagline overlay */}
        <div className="absolute bottom-8 left-8 right-8 z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="glass rounded-xl p-6 max-w-md"
          >
            <h2 className="font-display text-xl font-bold mb-2 text-balance">
              Transform UAV Imagery into Intelligence
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              A world-class photogrammetry pipeline for Zimbabwe local authorities.
              Convert drone captures into precise building footprints, LoD1 models,
              and georeferenced datasets.
            </p>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-2 mt-4">
              {['SfM Processing', 'AI Segmentation', 'LoD1 Export', 'Cadastral Mapping'].map(
                (feature) => (
                  <span
                    key={feature}
                    className="px-2 py-1 text-xs rounded-full bg-primary/10 text-primary border border-primary/20"
                  >
                    {feature}
                  </span>
                )
              )}
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Right: Auth Forms */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center p-6 lg:p-12 relative"
      >
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.1)_1px,transparent_1px)] bg-[size:64px_64px]" />
        </div>

        <AuthForms />

        {/* Version badge */}
        <div className="absolute bottom-4 right-4 text-xs text-muted-foreground/50">
          v2.0.0-beta
        </div>
      </motion.div>
    </div>
  );
}
