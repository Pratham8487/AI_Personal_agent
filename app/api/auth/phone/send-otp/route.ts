import {
  generateOtp,
  invalidateOtps,
  isRateLimited,
  OTP_RESEND_SECONDS,
  storeOtp,
} from "@/lib/server/otp";
import { normalizePhone, sendOtpSms } from "@/lib/server/phone-auth";

export async function POST(request: Request) {
  let body: { phone?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const phone = normalizePhone(body.phone ?? "");
  if (!phone) {
    return Response.json(
      { error: "Enter a valid phone number with country code, e.g. +15551234567" },
      { status: 400 }
    );
  }

  try {
    if (await isRateLimited("PHONE_VERIFICATION", phone)) {
      return Response.json(
        { error: `Please wait ${OTP_RESEND_SECONDS} seconds before requesting a new code.` },
        { status: 429 }
      );
    }

    const otp = generateOtp();
    await storeOtp("PHONE_VERIFICATION", phone, otp);
    try {
      await sendOtpSms(phone, otp);
    } catch (smsError) {
      // No SMS went out, so don't leave a row behind that rate-limits the retry.
      await invalidateOtps("PHONE_VERIFICATION", phone);
      throw smsError;
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("send-otp failed:", error);
    return Response.json(
      { error: "Could not send the verification code. Please try again." },
      { status: 502 }
    );
  }
}
