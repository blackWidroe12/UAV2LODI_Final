import { emailService } from '@/lib/email-service';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const to = searchParams.get('to');

  if (!to) {
    return Response.json({
      error: 'Missing required query parameter: ?to=recipient@example.com'
    }, { status: 400 });
  }

  try {
    await emailService.sendVerificationCode(to, '1234567', 'Test User');
    return Response.json({
      success: true,
      message: `Test verification email sent to ${to} from ${process.env.EMAIL_USER}`
    });
  } catch (error: any) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
