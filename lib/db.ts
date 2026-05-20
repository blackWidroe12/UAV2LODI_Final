// lib/db.ts

import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { ensureDbInitialised } from './db-init';
import { generateToken as generateJWT, verifyToken as verifyJWT } from './auth-jwt';
import { APIError, ErrorCodes } from './api-errors';
import type { 
  User, 
  ProjectConfig as Project, 
  GCPMarker, 
  GCPImportMeta,
  SfMConfig,
  SfMOutputs,
  StageResult
} from './types';

export type { User, Project, GCPMarker, GCPImportMeta, SfMConfig, SfMOutputs, StageResult };

// Single Prisma instance for the entire app (required for Next.js)
declare global {
  var prisma: PrismaClient | undefined;
}

const connectionString = process.env.DATABASE_URL || "postgresql://uav2lod1:tini1572@localhost:5433/uav2lod1_db";
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

const prisma =
  global.prisma ||
  new PrismaClient({
    adapter,
    log: process.env.DATABASE_LOG_QUERIES === 'true'
      ? ['query', 'error', 'warn']
      : ['error'],
  });

ensureDbInitialised(prisma);

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;

// ===== HELPERS =====

const SECRET_KEY = process.env.JWT_SECRET || "uav2lod1-secret-key-2024";

export function hashPassword(password: string): string {
  let h = 5381 >>> 0;
  const salted = password + SECRET_KEY;
  for (let i = 0; i < salted.length; i++) {
    h = (Math.imul(h, 33) ^ salted.charCodeAt(i)) >>> 0;
  }
  return `hashed_${h.toString(16).padStart(8, "0")}`;
}

export function verifyPassword(password: string, hash: string): boolean {
  if (hash.startsWith('hashed_')) {
    return hashPassword(password) === hash;
  }
  try {
    return bcrypt.compareSync(password, hash);
  } catch {
    return false;
  }
}

export function sanitizeUser(user: any): Omit<User, "passwordHash"> {
  if (!user) return null as any;
  const { passwordHash, verificationCode, verificationCodeExpiresAt, resetTokenHash, resetTokenExpiresAt, ...sanitized } = user;
  return {
    ...sanitized,
    emailVerified: user.isEmailVerified ?? user.emailVerified ?? false,
    isActive: user.isActive ?? true,
    createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
  };
}

export function safeUser(user: any) {
  return sanitizeUser(user);
}

// ===== USERS =====

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  return user ? (user as any) : undefined;
}

export async function findUserByUsername(username: string): Promise<User | undefined> {
  const user = await prisma.user.findUnique({ where: { username } });
  return user ? (user as any) : undefined;
}

export async function findUserById(id: string): Promise<User | undefined> {
  const user = await prisma.user.findUnique({ where: { id } });
  return user ? (user as any) : undefined;
}

export async function createUser(userData: any): Promise<User> {
  const passwordHash = await bcrypt.hash(userData.password, 12);
  const verificationCode = crypto.randomInt(1000000, 9999999).toString();

  const user = await prisma.user.create({
    data: {
      email: userData.email.toLowerCase(),
      username: userData.username,
      firstName: userData.firstName,
      lastName: userData.lastName,
      department: userData.department,
      avatarUrl: userData.avatarUrl ?? null,
      passwordHash,
      verificationCode,
      verificationCodeExpiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min
      isActive: true,
      isEmailVerified: false,
    },
  });

  return sanitizeUser(user) as any;
}

export async function updateUser(id: string, updates: any): Promise<User | null> {
  const data: any = {};
  if (updates.email !== undefined) data.email = updates.email.toLowerCase();
  if (updates.username !== undefined) data.username = updates.username;
  if (updates.firstName !== undefined) data.firstName = updates.firstName;
  if (updates.lastName !== undefined) data.lastName = updates.lastName;
  if (updates.department !== undefined) data.department = updates.department;
  if (updates.avatarUrl !== undefined) data.avatarUrl = updates.avatarUrl;
  if (updates.isActive !== undefined) data.isActive = updates.isActive;
  if (updates.isEmailVerified !== undefined) data.isEmailVerified = updates.isEmailVerified;
  if (updates.emailVerified !== undefined) data.isEmailVerified = updates.emailVerified;
  if (updates.password !== undefined) data.passwordHash = await bcrypt.hash(updates.password, 12);

  const user = await prisma.user.update({
    where: { id },
    data,
  });

  return sanitizeUser(user) as any;
}

export async function verifyUserEmail(id: string, code: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new Error('User not found');

  if (user.verificationCode !== code) {
    throw new Error('Invalid verification code');
  }

  if (!user.verificationCodeExpiresAt || user.verificationCodeExpiresAt < new Date()) {
    throw new Error('Verification code expired');
  }

  return updateUser(id, {
    isEmailVerified: true,
    verificationCode: null,
    verificationCodeExpiresAt: null,
  });
}

// ===== JWT & SESSIONS =====

/**
 * Create a JWT token for a user.
 * Uses the proper jsonwebtoken library with HS256 algorithm.
 */
export function createToken(user: any): string {
  return generateJWT(user.id);
}

/**
 * Verify a JWT token and return the payload.
 * Returns null if token is invalid or expired.
 */
export function verifyToken(token: string): any | null {
  return verifyJWT(token);
}

export async function createSession(userId: string) {
  const token = generateJWT(userId);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  return prisma.session.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });
}

export async function findSession(token: string) {
  const jwtPayload = verifyJWT(token);
  if (!jwtPayload) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return session;
}

export async function deleteSession(token: string) {
  return prisma.session.delete({
    where: { token },
  }).catch(() => null);
}

export async function deleteAllUserSessions(userId: string) {
  return prisma.session.deleteMany({
    where: { userId },
  });
}

export async function getCurrentUser(request?: Request): Promise<User | null> {
  let token: string | null = null;

  if (request) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim() || null;
    }
  }

  if (!token) {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get("auth_token")?.value ?? null;
    } catch (e) {
      // Ignore cookie read failures in edge contexts
    }
  }

  if (!token) return null;

  // Try JWT verification first
  const jwtPayload = verifyToken(token);
  if (jwtPayload) {
    const user = await findUserById(jwtPayload.userId);
    return user ? (user as any) : null;
  }

  // Fallback to database session lookup
  const dbSession = await findSession(token);
  if (dbSession) {
    return sanitizeUser(dbSession.user) as any;
  }

  return null;
}

// ===== PROJECTS =====

export async function createProject(
  userId: string,
  data: { name: string; directoryPath: string; crs?: string }
): Promise<Project> {
  const id = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const now = new Date();

  const project = await prisma.project.create({
    data: {
      id,
      userId,
      name: data.name,
      directoryPath: data.directoryPath,
      crs: data.crs || "EPSG:32736",
      lastCompletedPhase: null,
      flightParams: { altitude: 120, frontOverlap: 80, sideOverlap: 70, sensorWidth: 36 },
      processingOptions: { engine: "odm", gsd: 2.5, useGcp: true },
    },
  });

  return mapProject(project);
}

export async function saveProject(project: {
  id: string;
  userId: string;
  name: string;
  directoryPath: string;
  crs?: string;
  lastCompletedPhase?: string | null;
  flightParams?: any;
  processingOptions?: any;
  settings?: any;
  imageCount?: number;
  areaHectares?: number;
}): Promise<void> {
  const { id, userId, name, directoryPath, crs, lastCompletedPhase, flightParams, processingOptions, settings, imageCount, areaHectares } = project;

  // Validate required fields
  if (!id || !userId || !name || !directoryPath) {
    throw new APIError(
      ErrorCodes.INVALID_INPUT,
      400,
      'Project id, userId, name, and directoryPath are required'
    );
  }

  // Check that userId is not being changed
  const existing = await prisma.project.findUnique({ where: { id } });
  if (existing && existing.userId !== userId) {
    throw new APIError(
      ErrorCodes.FORBIDDEN,
      403,
      'Cannot change project owner'
    );
  }

  await prisma.project.upsert({
    where: { id },
    update: {
      name: name.trim(),
      directoryPath: directoryPath.trim(),
      crs: crs || 'EPSG:4326',
      lastCompletedPhase: lastCompletedPhase || undefined,
      flightParams: flightParams || undefined,
      processingOptions: processingOptions || undefined,
      settings: settings || undefined,
      imageCount: imageCount !== undefined ? imageCount : undefined,
      areaHectares: areaHectares !== undefined ? areaHectares : undefined,
      // DO NOT update userId — it's immutable
    },
    create: {
      id,
      userId, // Can only set on create
      name: name.trim(),
      directoryPath: directoryPath.trim(),
      crs: crs || 'EPSG:4326',
      lastCompletedPhase: lastCompletedPhase || null,
      flightParams: flightParams || undefined,
      processingOptions: processingOptions || undefined,
      settings: settings || undefined,
      imageCount: imageCount !== undefined ? imageCount : undefined,
      areaHectares: areaHectares !== undefined ? areaHectares : undefined,
    },
  });
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  const project = await prisma.project.findUnique({ where: { id } });
  return project ? mapProject(project) : undefined;
}

export async function getProjectsByUserId(userId: string): Promise<Project[]> {
  const projects = await prisma.project.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  return projects.map(mapProject);
}

export async function getProjectsByUser(userId: string): Promise<Project[]> {
  return getProjectsByUserId(userId);
}

export async function updateProject(
  id: string,
  updates: any
): Promise<Project | undefined> {
  const project = await prisma.project.update({
    where: { id },
    data: {
      name: updates.name,
      directoryPath: updates.directoryPath,
      crs: updates.crs,
      lastCompletedPhase: updates.lastCompletedPhase,
      flightParams: updates.flightParams || undefined,
      processingOptions: updates.processingOptions || undefined,
      settings: updates.settings || undefined,
      imageCount: updates.imageCount !== undefined ? updates.imageCount : undefined,
      areaHectares: updates.areaHectares !== undefined ? updates.areaHectares : undefined,
    },
  });
  return mapProject(project);
}

export async function deleteProject(id: string): Promise<boolean> {
  try {
    await prisma.project.delete({
      where: { id },
    });
    return true;
  } catch {
    return false;
  }
}

function mapProject(p: any): Project {
  return {
    id: p.id,
    userId: p.userId,
    name: p.name,
    directoryPath: p.directoryPath,
    crs: p.crs,
    createdAt: p.createdAt.toISOString(),
    lastModified: p.updatedAt.toISOString(),
    lastCompletedPhase: p.lastCompletedPhase,
    flightParams: (p.flightParams as any) || { altitude: 120, frontOverlap: 80, sideOverlap: 70, sensorWidth: 36 },
    processingOptions: (p.processingOptions as any) || { engine: "odm", gsd: 2.5, useGcp: true },
    settings: (p.settings as any) || undefined,
    imageCount: p.imageCount ?? undefined,
    areaHectares: p.areaHectares ?? undefined,
  };
}

// ===== GCP DATA =====

export async function saveGCPs(
  projectId: string,
  gcps: GCPMarker[],
  meta?: GCPImportMeta
): Promise<void> {
  // Delete existing GCPs for this project
  await prisma.gCPMarker.deleteMany({
    where: { projectId },
  });

  if (meta) {
    // Upsert GCP data metadata
    await prisma.gCPData.upsert({
      where: { projectId },
      update: {
        sourceFile: meta.sourceFile,
        crs: meta.crs,
        importedAt: new Date(meta.importedAt),
        totalImported: meta.totalImported,
        totalRows: meta.totalRows,
        skippedRows: meta.skippedRows,
      },
      create: {
        projectId,
        sourceFile: meta.sourceFile,
        crs: meta.crs,
        importedAt: new Date(meta.importedAt),
        totalImported: meta.totalImported,
        totalRows: meta.totalRows,
        skippedRows: meta.skippedRows,
      },
    });
  }

  // Insert all GCPs
  if (gcps.length > 0) {
    await prisma.gCPMarker.createMany({
      data: gcps.map(gcp => ({
        id: gcp.id || `gcp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        projectId,
        name: gcp.name,
        lng: gcp.longitude,
        lat: gcp.latitude,
        elevation: gcp.elevation,
        accuracyH: gcp.accuracyH || null,
        accuracyV: gcp.accuracyV || null,
        description: gcp.description || null,
      })),
    });
  }
}

export async function getGCPs(projectId: string): Promise<GCPMarker[]> {
  const markers = await prisma.gCPMarker.findMany({
    where: { projectId },
  });

  return markers.map((m: any) => ({
    id: m.id,
    name: m.name,
    longitude: m.lng,
    latitude: m.lat,
    elevation: m.elevation,
    accuracyH: m.accuracyH ?? undefined,
    accuracyV: m.accuracyV ?? undefined,
    description: m.description ?? undefined,
    isVerified: true,
  }));
}

export async function getGCPsByProject(projectId: string): Promise<GCPMarker[]> {
  return getGCPs(projectId);
}

export async function getGCPMeta(projectId: string): Promise<GCPImportMeta | null> {
  const data = await prisma.gCPData.findUnique({
    where: { projectId },
  });

  if (!data) return null;

  return {
    sourceFile: data.sourceFile,
    crs: data.crs,
    importedAt: data.importedAt.getTime(),
    totalImported: data.totalImported,
    totalRows: data.totalRows,
    skippedRows: data.skippedRows,
  };
}

export async function getGCPCrs(projectId: string): Promise<string> {
  const data = await prisma.gCPData.findUnique({
    where: { projectId },
  });
  return data?.crs ?? 'EPSG:4326';
}

// ===== STAGE RESULTS =====

export async function saveStageResult(
  projectId: string,
  stageId: string,
  result: StageResult
): Promise<void> {
  const { status, startedAt, completedAt, error, outputs } = result;

  // Upsert stage result
  const stageResult = await prisma.stageResult.upsert({
    where: { projectId_stageId: { projectId, stageId } },
    update: {
      status,
      startedAt: startedAt ? new Date(startedAt) : null,
      completedAt: completedAt ? new Date(completedAt) : null,
      error,
    },
    create: {
      projectId,
      stageId,
      status,
      startedAt: startedAt ? new Date(startedAt) : null,
      completedAt: completedAt ? new Date(completedAt) : null,
      error,
    },
  });

  // If this is SFM with outputs, save them
  if (stageId === 'sfm' && outputs) {
    await prisma.sfMOutputs.upsert({
      where: { stageResultId: stageResult.id },
      update: {
        orthoPath: outputs.orthoPath,
        dsmPath: outputs.dsmPath,
        dtmPath: outputs.dtmPath,
        pointCloudPath: outputs.pointCloudPath,
        gcpReportPath: outputs.gcpReportPath,
        gsdAchieved: outputs.gsdAchieved,
        gcpRmsError: outputs.gcpRmsError,
        processingTimeSeconds: outputs.processingTimeSeconds,
        taskId: outputs.taskId,
      },
      create: {
        stageResultId: stageResult.id,
        orthoPath: outputs.orthoPath,
        dsmPath: outputs.dsmPath,
        dtmPath: outputs.dtmPath,
        pointCloudPath: outputs.pointCloudPath,
        gcpReportPath: outputs.gcpReportPath,
        gsdAchieved: outputs.gsdAchieved,
        gcpRmsError: outputs.gcpRmsError,
        processingTimeSeconds: outputs.processingTimeSeconds,
        taskId: outputs.taskId,
      },
    });
  }
}

export async function getStageResult(projectId: string, stageId: string): Promise<StageResult | null> {
  const result = await prisma.stageResult.findUnique({
    where: { projectId_stageId: { projectId, stageId } },
    include: { sfmOutputs: true },
  });

  if (!result) return null;

  return {
    stageId: result.stageId,
    status: result.status as any,
    startedAt: result.startedAt?.getTime() ?? null,
    completedAt: result.completedAt?.getTime() ?? null,
    error: result.error,
    outputs: result.sfmOutputs ? {
      orthoPath: result.sfmOutputs.orthoPath,
      dsmPath: result.sfmOutputs.dsmPath,
      dtmPath: result.sfmOutputs.dtmPath,
      pointCloudPath: result.sfmOutputs.pointCloudPath,
      gcpReportPath: result.sfmOutputs.gcpReportPath,
      gsdAchieved: result.sfmOutputs.gsdAchieved,
      gcpRmsError: result.sfmOutputs.gcpRmsError,
      processingTimeSeconds: result.sfmOutputs.processingTimeSeconds,
      taskId: result.sfmOutputs.taskId,
      completedAt: result.completedAt?.getTime() ?? null,
    } : null,
  };
}

export async function getAllStageResults(projectId: string): Promise<Record<string, StageResult>> {
  const results = await prisma.stageResult.findMany({
    where: { projectId },
    include: { sfmOutputs: true },
  });

  const mapped: Record<string, StageResult> = {};
  for (const result of results) {
    mapped[result.stageId] = {
      stageId: result.stageId,
      status: result.status as any,
      startedAt: result.startedAt?.getTime() ?? null,
      completedAt: result.completedAt?.getTime() ?? null,
      error: result.error,
      outputs: result.sfmOutputs ? {
        orthoPath: result.sfmOutputs.orthoPath,
        dsmPath: result.sfmOutputs.dsmPath,
        dtmPath: result.sfmOutputs.dtmPath,
        pointCloudPath: result.sfmOutputs.pointCloudPath,
        gcpReportPath: result.sfmOutputs.gcpReportPath,
        gsdAchieved: result.sfmOutputs.gsdAchieved,
        gcpRmsError: result.sfmOutputs.gcpRmsError,
        processingTimeSeconds: result.sfmOutputs.processingTimeSeconds,
        taskId: result.sfmOutputs.taskId,
        completedAt: result.completedAt?.getTime() ?? null,
      } : null,
    };
  }
  return mapped;
}

export async function getSfMAssetPath(
  projectId: string,
  assetKey: 'orthoPath' | 'dsmPath' | 'dtmPath' | 'pointCloudPath' | 'gcpReportPath'
): Promise<string | null> {
  const result = await getStageResult(projectId, 'sfm');
  if (!result?.outputs) return null;

  const outputs = result.outputs as SfMOutputs;
  return outputs[assetKey] ?? null;
}

// ===== SFM CONFIG & PROGRESS =====

export async function saveSfMConfig(projectId: string, config: SfMConfig): Promise<void> {
  await prisma.sfMConfig.upsert({
    where: { projectId },
    update: {
      odmNodeUrl: config.odmNodeUrl,
      odmNodePort: config.odmNodePort,
      featureQuality: config.featureQuality,
      pointCloudQuality: config.pointCloudQuality,
      meshSize: config.meshSize,
      desiredGSD: config.desiredGSD,
      useGCPs: config.useGCPs,
      minNumFeatures: config.minNumFeatures,
      pcFilteringDistance: config.pcFilteringDistance,
      fastOrthophoto: config.fastOrthophoto ?? false,
      useHybridMesh: config.useHybridMesh ?? false,
    },
    create: {
      projectId,
      odmNodeUrl: config.odmNodeUrl,
      odmNodePort: config.odmNodePort,
      featureQuality: config.featureQuality,
      pointCloudQuality: config.pointCloudQuality,
      meshSize: config.meshSize,
      desiredGSD: config.desiredGSD,
      useGCPs: config.useGCPs,
      minNumFeatures: config.minNumFeatures,
      pcFilteringDistance: config.pcFilteringDistance,
      fastOrthophoto: config.fastOrthophoto ?? false,
      useHybridMesh: config.useHybridMesh ?? false,
    },
  });
}

export async function getSfMConfig(projectId: string): Promise<SfMConfig | null> {
  const config = await prisma.sfMConfig.findUnique({
    where: { projectId },
  });

  if (!config) return null;

  return {
    odmNodeUrl: config.odmNodeUrl,
    odmNodePort: config.odmNodePort,
    featureQuality: config.featureQuality as any,
    pointCloudQuality: config.pointCloudQuality as any,
    meshSize: config.meshSize,
    desiredGSD: config.desiredGSD,
    useGCPs: config.useGCPs,
    minNumFeatures: config.minNumFeatures,
    pcFilteringDistance: config.pcFilteringDistance,
    fastOrthophoto: config.fastOrthophoto,
    useHybridMesh: config.useHybridMesh,
  };
}

// In-memory fallback for stage progress percentage/message
declare global {
  var __sfmProgress: Record<string, { percentage: number; message: string }> | undefined;
}

const sfmProgressStore = global.__sfmProgress || {};
if (process.env.NODE_ENV !== 'production') {
  global.__sfmProgress = sfmProgressStore;
}

export function saveStageProgress(
  projectId: string,
  stageId: string,
  progress: { percentage: number; message: string }
): void {
  if (stageId === 'sfm') {
    sfmProgressStore[projectId] = progress;
  }
}

export function getSfMProgress(
  projectId: string,
  stageId: string
): { percentage: number; message: string } | null {
  if (stageId === 'sfm') {
    return sfmProgressStore[projectId] ?? null;
  }
  return null;
}

// ===== PASSWORD RESET & VERIFICATION =====

declare global {
  var __verificationCodes: Record<string, { code: string; email: string; expiresAt: number; attempts: number }> | undefined;
  var __passwordResetTokens: Record<string, { token: string; userId: string; email: string; expiresAt: number; used: boolean }> | undefined;
}

const verificationStore = global.__verificationCodes || {};
const resetTokenStore = global.__passwordResetTokens || {};

if (process.env.NODE_ENV !== 'production') {
  global.__verificationCodes = verificationStore;
  global.__passwordResetTokens = resetTokenStore;
}

export function generateVerificationCode(): string {
  return Math.floor(1000000 + Math.random() * 9000000).toString();
}

export function createVerificationCode(email: string) {
  const code = generateVerificationCode();
  const verification = {
    code,
    email,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    attempts: 0,
  };
  verificationStore[email] = verification;
  return verification;
}

export function getVerificationCode(email: string) {
  return verificationStore[email];
}

export async function verifyCode(email: string, code: string): Promise<{ valid: boolean; error?: string }> {
  const verification = verificationStore[email];
  
  if (!verification) {
    return { valid: false, error: "No verification code found. Please request a new one." };
  }
  
  if (verification.expiresAt < Date.now()) {
    delete verificationStore[email];
    return { valid: false, error: "Verification code has expired. Please request a new one." };
  }
  
  if (verification.attempts >= 5) {
    delete verificationStore[email];
    return { valid: false, error: "Too many failed attempts. Please request a new code." };
  }
  
  if (verification.code !== code) {
    verification.attempts++;
    return { valid: false, error: `Invalid code. ${5 - verification.attempts} attempts remaining.` };
  }
  
  // Success
  delete verificationStore[email];
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { isEmailVerified: true },
    });
  }
  
  return { valid: true };
}

export function deleteVerificationCode(email: string): void {
  delete verificationStore[email];
}

export function generateResetToken(): string {
  return `rst_${Date.now()}_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
}

export function createPasswordResetToken(userId: string, email: string) {
  const existingToken = Object.values(resetTokenStore).find(
    (t) => t.userId === userId && t.expiresAt > Date.now() && !t.used
  );
  
  if (existingToken) {
    return null;
  }
  
  const token = generateResetToken();
  const resetToken = {
    token,
    userId,
    email,
    expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
    used: false,
  };
  resetTokenStore[token] = resetToken;
  return resetToken;
}

export function getPasswordResetToken(token: string) {
  return resetTokenStore[token];
}

export function validateResetToken(token: string): { valid: boolean; error?: string; userId?: string } {
  const resetToken = resetTokenStore[token];
  
  if (!resetToken) {
    return { valid: false, error: "Invalid reset link. Please request a new password reset." };
  }
  
  if (resetToken.used) {
    return { valid: false, error: "This reset link has already been used. Please request a new one." };
  }
  
  if (resetToken.expiresAt < Date.now()) {
    delete resetTokenStore[token];
    return { valid: false, error: "This reset link has expired. Please request a new password reset." };
  }
  
  return { valid: true, userId: resetToken.userId };
}

export async function useResetToken(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  const resetToken = resetTokenStore[token];
  
  const validation = validateResetToken(token);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }
  
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const user = await prisma.user.findUnique({ where: { id: resetToken.userId } });
  if (!user) {
    return { success: false, error: "User not found." };
  }
  
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });
  
  resetToken.used = true;
  return { success: true };
}

export function deleteExpiredTokens(): void {
  const now = Date.now();
  
  Object.entries(verificationStore).forEach(([email, code]) => {
    if (code.expiresAt < now) {
      delete verificationStore[email];
    }
  });
  
  Object.entries(resetTokenStore).forEach(([token, resetToken]) => {
    if (resetToken.expiresAt < now || resetToken.used) {
      delete resetTokenStore[token];
    }
  });
}

export async function updateUserPassword(userId: string, newPassword: string): Promise<boolean> {
  const passwordHash = await bcrypt.hash(newPassword, 12);
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    return true;
  } catch {
    return false;
  }
}
