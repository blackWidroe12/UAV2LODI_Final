'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Building2,
  Camera,
  Check,
  Loader2,
  Upload,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/stores';
import { authApi } from '@/lib/api';

type AuthMode = 'login' | 'signup' | 'forgot-password' | 'reset-password' | 'verify-email';
type SignupStep = 'identity' | 'security' | 'verification' | 'avatar';

const STEP_TITLES: Record<SignupStep, { title: string; subtitle: string }> = {
  identity: {
    title: 'Create your identity',
    subtitle: 'Tell us who you are',
  },
  security: {
    title: 'Secure your account',
    subtitle: 'Set up your credentials',
  },
  verification: {
    title: 'Verify your email',
    subtitle: 'Enter the 7-digit code sent to your email',
  },
  avatar: {
    title: 'Almost there',
    subtitle: 'Add a profile picture',
  },
};

// Debounce hook for real-time validation
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export function AuthForms() {
  const { login, setLoading, setError, isLoading, error, clearError } = useAuthStore();
  const [mode, setMode] = useState<AuthMode>('login');
  const [signupStep, setSignupStep] = useState<SignupStep>('identity');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Form data
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    username: '',
    firstName: '',
    lastName: '',
    department: '',
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Verification state
  const [verificationCode, setVerificationCode] = useState(['', '', '', '', '', '', '']);
  const [verificationExpiry, setVerificationExpiry] = useState<number | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const verificationInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Password reset state
  const [resetToken, setResetToken] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  // Real-time validation state
  const [emailStatus, setEmailStatus] = useState<{ checking: boolean; available: boolean | null; reason: string | null }>({
    checking: false,
    available: null,
    reason: null,
  });
  const [usernameStatus, setUsernameStatus] = useState<{ checking: boolean; available: boolean | null; reason: string | null }>({
    checking: false,
    available: null,
    reason: null,
  });

  // Debounced values for real-time validation
  const debouncedEmail = useDebounce(formData.email, 500);
  const debouncedUsername = useDebounce(formData.username, 500);

  // Load saved email on mount (only if user previously checked "remember me")
  useEffect(() => {
    const savedEmail = localStorage.getItem('saved_email');
    if (savedEmail) {
      setFormData((prev) => ({
        ...prev,
        email: savedEmail,
      }));
      setRememberMe(true);
    }
  }, []);

  // Real-time email validation
  useEffect(() => {
    if (mode !== 'signup' || signupStep !== 'security' || !debouncedEmail) {
      setEmailStatus({ checking: false, available: null, reason: null });
      return;
    }

    const checkEmail = async () => {
      setEmailStatus({ checking: true, available: null, reason: null });
      const result = await authApi.checkEmail(debouncedEmail);
      if (result.success && result.data) {
        setEmailStatus({
          checking: false,
          available: result.data.available,
          reason: result.data.reason,
        });
      } else {
        setEmailStatus({ checking: false, available: null, reason: null });
      }
    };

    checkEmail();
  }, [debouncedEmail, mode, signupStep]);

  // Real-time username validation
  useEffect(() => {
    if (mode !== 'signup' || signupStep !== 'identity' || !debouncedUsername) {
      setUsernameStatus({ checking: false, available: null, reason: null });
      return;
    }

    const checkUsername = async () => {
      setUsernameStatus({ checking: true, available: null, reason: null });
      const result = await authApi.checkUsername(debouncedUsername);
      if (result.success && result.data) {
        setUsernameStatus({
          checking: false,
          available: result.data.available,
          reason: result.data.reason,
        });
      } else {
        setUsernameStatus({ checking: false, available: null, reason: null });
      }
    };

    checkUsername();
  }, [debouncedUsername, mode, signupStep]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const updateFormData = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    clearError();
  };

  // Handle avatar selection
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Login handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    clearError();

    try {
      const result = await authApi.login({
        email: formData.email,
        password: formData.password,
      });

      if (result.success && result.data) {
        // Save email only if "remember me" is checked
        if (rememberMe) {
          localStorage.setItem('saved_email', formData.email);
        } else {
          localStorage.removeItem('saved_email');
        }
        
        login(result.data.user, result.data.token);
      } else {
        setError(result.error || 'Login failed');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Forgot password handler
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    clearError();

    try {
      const result = await authApi.forgotPassword(formData.email);
      
      if (result.success) {
        setResetSuccess(true);
        // In development, auto-fill the reset token for testing
        if (result.data?.token) {
          setResetToken(result.data.token);
        }
      } else {
        setError(result.error || 'Failed to send reset email');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Reset password handler
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    clearError();

    try {
      const result = await authApi.resetPassword(resetToken, formData.password, formData.confirmPassword);
      
      if (result.success) {
        setResetSuccess(true);
        setTimeout(() => {
          setMode('login');
          setResetSuccess(false);
          setResetToken('');
          setFormData(prev => ({ ...prev, password: '', confirmPassword: '' }));
        }, 2000);
      } else {
        setError(result.error || 'Failed to reset password');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Verification code handlers
  const handleVerificationInput = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    
    const newCode = [...verificationCode];
    newCode[index] = value.slice(-1);
    setVerificationCode(newCode);
    
    // Auto-focus next input
    if (value && index < 6) {
      verificationInputRefs.current[index + 1]?.focus();
    }
  };

  const handleVerificationKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !verificationCode[index] && index > 0) {
      verificationInputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyEmail = async () => {
    const code = verificationCode.join('');
    if (code.length !== 7) {
      setError('Please enter the complete 7-digit code');
      return;
    }

    setLoading(true);
    clearError();

    try {
      const result = await authApi.verifyEmail(formData.email, code);
      
      if (result.success && result.data?.verified) {
        setSignupStep('avatar');
      } else {
        setError(result.error || 'Verification failed');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;

    setLoading(true);
    clearError();

    try {
      const result = await authApi.sendVerification(formData.email);
      
      if (result.success) {
        setResendCooldown(60);
        setVerificationCode(['', '', '', '', '', '', '']);
      } else {
        setError(result.error || 'Failed to resend code');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Signup handlers
  const handleSignupNext = () => {
    if (signupStep === 'identity') {
      if (!formData.firstName || !formData.lastName || !formData.username) {
        setError('Please fill in all fields');
        return;
      }
      if (usernameStatus.available === false) {
        setError(usernameStatus.reason || 'Username is not available');
        return;
      }
      setSignupStep('security');
    } else if (signupStep === 'security') {
      if (!formData.email || !formData.password || !formData.department) {
        setError('Please fill in all fields');
        return;
      }
      if (emailStatus.available === false) {
        setError(emailStatus.reason || 'Email is not available');
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (formData.password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }
      // Proceed to registration
      handleRegister();
    }
    clearError();
  };

  const handleRegister = async () => {
    setLoading(true);
    clearError();

    try {
      const result = await authApi.register({
        email: formData.email,
        password: formData.password,
        username: formData.username,
        firstName: formData.firstName,
        lastName: formData.lastName,
        department: formData.department,
      });

      if (result.success && result.data) {
        // Move to verification step
        setSignupStep('verification');
        setResendCooldown(60);
      } else {
        setError(result.error || 'Registration failed');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSignupBack = () => {
    if (signupStep === 'security') {
      setSignupStep('identity');
    } else if (signupStep === 'verification') {
      setSignupStep('security');
    } else if (signupStep === 'avatar') {
      setSignupStep('verification');
    }
  };

  const handleSignupComplete = async () => {
    setLoading(true);
    clearError();

    try {
      // At this point user is already registered, just need to upload avatar and login
      const loginResult = await authApi.login({
        email: formData.email,
        password: formData.password,
      });

      if (loginResult.success && loginResult.data) {
        // Upload avatar if selected
        if (avatarFile) {
          const avatarResult = await authApi.uploadAvatar(avatarFile, loginResult.data.token);
          if (avatarResult.success && avatarResult.data) {
            loginResult.data.user.avatarUrl = avatarResult.data.avatarUrl;
          }
        }

        login(loginResult.data.user, loginResult.data.token);
      } else {
        setError(loginResult.error || 'Failed to complete registration');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setSignupStep('identity');
    setResetSuccess(false);
    setResetToken('');
    setVerificationCode(['', '', '', '', '', '', '']);
    clearError();
  };

  const userInitials = formData.firstName && formData.lastName
    ? `${formData.firstName[0]}${formData.lastName[0]}`.toUpperCase()
    : 'U';

  // Validation status indicator
  const ValidationIndicator = ({ status }: { status: { checking: boolean; available: boolean | null; reason: string | null } }) => {
    if (status.checking) {
      return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
    }
    if (status.available === true) {
      return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    }
    if (status.available === false) {
      return <AlertCircle className="w-4 h-4 text-destructive" />;
    }
    return null;
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent mb-4 glow-cyan">
          <Building2 className="w-8 h-8 text-primary-foreground" />
        </div>
        <h1 className="font-display text-2xl font-bold text-balance">UAV2LoD1-ZW</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Photogrammetry Pipeline Workstation
        </p>
      </motion.div>

      {/* Form Card */}
      <motion.div
        layout
        className="glass-strong rounded-2xl p-6"
      >
        <AnimatePresence mode="wait">
          {/* Login Form */}
          {mode === 'login' && (
            <motion.div
              key="login"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <div className="text-center mb-6">
                <h2 className="font-display text-xl font-semibold">Welcome back</h2>
                <p className="text-muted-foreground text-sm">
                  Sign in to continue to your workspace
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@organization.zw"
                      className="pl-10"
                      value={formData.email}
                      onChange={(e) => updateFormData('email', e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={() => switchMode('forgot-password')}
                      className="text-xs text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      className="pl-10 pr-10"
                      value={formData.password}
                      onChange={(e) => updateFormData('password', e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Remember me checkbox */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="remember-me"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-input bg-background cursor-pointer"
                  />
                  <Label htmlFor="remember-me" className="text-sm cursor-pointer">
                    Remember me for 30 days
                  </Label>
                </div>

                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-destructive text-sm text-center"
                  >
                    {error}
                  </motion.p>
                )}

                <Button
                  type="submit"
                  className="w-full gap-2 glow-cyan"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Sign In
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <button
                  onClick={() => switchMode('signup')}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Don&apos;t have an account?{' '}
                  <span className="font-medium text-primary">Create one</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* Forgot Password Form */}
          {mode === 'forgot-password' && (
            <motion.div
              key="forgot-password"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
                  <KeyRound className="w-6 h-6 text-primary" />
                </div>
                <h2 className="font-display text-xl font-semibold">Reset password</h2>
                <p className="text-muted-foreground text-sm">
                  {resetSuccess 
                    ? "Check your email for the reset link"
                    : "Enter your email to receive a reset link"
                  }
                </p>
              </div>

              {resetSuccess ? (
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    If an account exists with this email, you will receive a password reset link.
                  </p>
                  {resetToken && (
                    <div className="mt-4 p-3 rounded-lg bg-secondary/50 text-sm">
                      <p className="text-muted-foreground mb-2">Development Mode:</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setMode('reset-password');
                          setResetSuccess(false);
                        }}
                        className="w-full"
                      >
                        Reset Password Now
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="reset-email"
                        type="email"
                        placeholder="name@organization.zw"
                        className="pl-10"
                        value={formData.email}
                        onChange={(e) => updateFormData('email', e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-destructive text-sm text-center"
                    >
                      {error}
                    </motion.p>
                  )}

                  <Button
                    type="submit"
                    className="w-full gap-2"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Send Reset Link
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </form>
              )}

              <div className="mt-6 text-center">
                <button
                  onClick={() => switchMode('login')}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" />
                  Back to sign in
                </button>
              </div>
            </motion.div>
          )}

          {/* Reset Password Form */}
          {mode === 'reset-password' && (
            <motion.div
              key="reset-password"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
                  <Lock className="w-6 h-6 text-primary" />
                </div>
                <h2 className="font-display text-xl font-semibold">
                  {resetSuccess ? "Password Reset!" : "Create new password"}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {resetSuccess 
                    ? "You can now log in with your new password"
                    : "Enter your new password below"
                  }
                </p>
              </div>

              {resetSuccess ? (
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 mb-4">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  </div>
                </div>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="new-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Minimum 8 characters"
                        className="pl-10 pr-10"
                        value={formData.password}
                        onChange={(e) => updateFormData('password', e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-new-password">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="confirm-new-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Re-enter password"
                        className="pl-10"
                        value={formData.confirmPassword}
                        onChange={(e) => updateFormData('confirmPassword', e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-destructive text-sm text-center"
                    >
                      {error}
                    </motion.p>
                  )}

                  <Button
                    type="submit"
                    className="w-full gap-2"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Reset Password
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </form>
              )}

              <div className="mt-6 text-center">
                <button
                  onClick={() => switchMode('login')}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" />
                  Back to sign in
                </button>
              </div>
            </motion.div>
          )}

          {/* Signup Form */}
          {mode === 'signup' && (
            <motion.div
              key="signup"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              {/* Step indicator */}
              <div className="flex items-center justify-center gap-2 mb-6">
                {(['identity', 'security', 'verification', 'avatar'] as SignupStep[]).map((step, index) => (
                  <div key={step} className="flex items-center">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors',
                        signupStep === step
                          ? 'bg-primary text-primary-foreground'
                          : index < ['identity', 'security', 'verification', 'avatar'].indexOf(signupStep)
                          ? 'bg-emerald-500 text-background'
                          : 'bg-secondary text-muted-foreground'
                      )}
                    >
                      {index < ['identity', 'security', 'verification', 'avatar'].indexOf(signupStep) ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        index + 1
                      )}
                    </div>
                    {index < 3 && (
                      <div
                        className={cn(
                          'w-6 h-0.5 mx-1',
                          index < ['identity', 'security', 'verification', 'avatar'].indexOf(signupStep)
                            ? 'bg-emerald-500'
                            : 'bg-secondary'
                        )}
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="text-center mb-6">
                <h2 className="font-display text-xl font-semibold">
                  {STEP_TITLES[signupStep].title}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {STEP_TITLES[signupStep].subtitle}
                </p>
              </div>

              <AnimatePresence mode="wait">
                {/* Step 1: Identity */}
                {signupStep === 'identity' && (
                  <motion.div
                    key="identity"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-4"
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">First Name</Label>
                        <Input
                          id="firstName"
                          placeholder="John"
                          value={formData.firstName}
                          onChange={(e) => updateFormData('firstName', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input
                          id="lastName"
                          placeholder="Moyo"
                          value={formData.lastName}
                          onChange={(e) => updateFormData('lastName', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="username"
                          placeholder="jmoyo"
                          className="pl-10 pr-10"
                          value={formData.username}
                          onChange={(e) => updateFormData('username', e.target.value)}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <ValidationIndicator status={usernameStatus} />
                        </div>
                      </div>
                      {usernameStatus.reason && !usernameStatus.available && (
                        <p className="text-xs text-destructive">{usernameStatus.reason}</p>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* Step 2: Security */}
                {signupStep === 'security' && (
                  <motion.div
                    key="security"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="signupEmail">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="signupEmail"
                          type="email"
                          placeholder="name@organization.zw"
                          className="pl-10 pr-10"
                          value={formData.email}
                          onChange={(e) => updateFormData('email', e.target.value)}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <ValidationIndicator status={emailStatus} />
                        </div>
                      </div>
                      {emailStatus.reason && !emailStatus.available && (
                        <p className="text-xs text-destructive">{emailStatus.reason}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="department">Department</Label>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="department"
                          placeholder="e.g., Surveying, GIS, Planning"
                          className="pl-10"
                          value={formData.department}
                          onChange={(e) => updateFormData('department', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signupPassword">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="signupPassword"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Minimum 8 characters"
                          className="pl-10 pr-10"
                          value={formData.password}
                          onChange={(e) => updateFormData('password', e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="confirmPassword"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Re-enter password"
                          className="pl-10"
                          value={formData.confirmPassword}
                          onChange={(e) => updateFormData('confirmPassword', e.target.value)}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Step 3: Email Verification */}
                {signupStep === 'verification' && (
                  <motion.div
                    key="verification"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground mb-4">
                        We sent a code to <span className="font-medium text-foreground">{formData.email}</span>
                      </p>
                      
                      {/* 7-digit code input */}
                      <div className="flex justify-center gap-2 mb-4">
                        {verificationCode.map((digit, index) => (
                          <Input
                            key={index}
                            ref={(el) => { verificationInputRefs.current[index] = el; }}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            value={digit}
                            onChange={(e) => handleVerificationInput(index, e.target.value)}
                            onKeyDown={(e) => handleVerificationKeyDown(index, e)}
                            className="w-10 h-12 text-center text-lg font-semibold"
                          />
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={handleResendCode}
                        disabled={resendCooldown > 0 || isLoading}
                        className="text-sm text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
                      >
                        <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
                        {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Step 4: Avatar */}
                {signupStep === 'avatar' && (
                  <motion.div
                    key="avatar"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="flex flex-col items-center">
                      <div className="relative group">
                        <Avatar className="w-24 h-24 border-4 border-primary/20">
                          <AvatarImage src={avatarPreview || undefined} />
                          <AvatarFallback className="bg-secondary text-2xl">
                            {userInitials}
                          </AvatarFallback>
                        </Avatar>
                        <label
                          htmlFor="avatar-upload"
                          className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-colors"
                        >
                          <Camera className="w-4 h-4" />
                        </label>
                        <input
                          id="avatar-upload"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleAvatarChange}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground mt-4 text-center">
                        Click the camera icon to upload your profile picture
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-destructive text-sm text-center mt-4"
                >
                  {error}
                </motion.p>
              )}

              {/* Navigation buttons */}
              <div className="flex gap-3 mt-6">
                {signupStep !== 'identity' && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSignupBack}
                    disabled={isLoading}
                    className="flex-1"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                )}
                
                {signupStep === 'verification' ? (
                  <Button
                    type="button"
                    onClick={handleVerifyEmail}
                    disabled={isLoading || verificationCode.join('').length !== 7}
                    className="flex-1 gap-2"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Verify Email
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                ) : signupStep === 'avatar' ? (
                  <Button
                    type="button"
                    onClick={handleSignupComplete}
                    disabled={isLoading}
                    className="flex-1 gap-2 glow-cyan"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Complete Setup
                        <Check className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={handleSignupNext}
                    disabled={isLoading || (signupStep === 'identity' && usernameStatus.available === false) || (signupStep === 'security' && emailStatus.available === false)}
                    className={cn("flex-1 gap-2", signupStep === 'identity' && "glow-cyan")}
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        {signupStep === 'security' ? 'Create Account' : 'Continue'}
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                )}
              </div>

              <div className="mt-6 text-center">
                <button
                  onClick={() => switchMode('login')}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Already have an account?{' '}
                  <span className="font-medium text-primary">Sign in</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
