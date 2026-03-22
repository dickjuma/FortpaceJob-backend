import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
});

const Spinner = () => (
  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
  </svg>
);

const OtpVerification = ({ identifier, channel = 'email', onSuccess, onBack }) => {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const inputsRef = useRef([]);
  const autoSubmitTimerRef = useRef(null);

  // Focus first input on mount
  useEffect(() => {
    inputsRef.current[0]?.focus();
    return () => {
      if (autoSubmitTimerRef.current) {
        clearTimeout(autoSubmitTimerRef.current);
      }
    };
  }, []);

  // Countdown timer for resend
  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = setTimeout(() => setResendTimer(t => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendTimer]);

  const handleOtpChange = (index, value) => {
    // Only allow digits
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    // Auto‑focus next input
    if (value && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!otp[index] && index > 0) {
        // Move to previous and clear it
        inputsRef.current[index - 1]?.focus();
        const newOtp = [...otp];
        newOtp[index - 1] = '';
        setOtp(newOtp);
      } else if (otp[index]) {
        // Clear current
        const newOtp = [...otp];
        newOtp[index] = '';
        setOtp(newOtp);
      }
    } else if (e.key === 'Delete') {
      // Clear current and move to next if any
      const newOtp = [...otp];
      newOtp[index] = '';
      setOtp(newOtp);
      if (index < 5) {
        inputsRef.current[index + 1]?.focus();
      }
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newOtp = [...otp];
    for (let i = 0; i < pasted.length; i++) {
      newOtp[i] = pasted[i];
    }
    setOtp(newOtp);
    const lastIndex = Math.min(pasted.length, 5);
    inputsRef.current[lastIndex]?.focus();
  };

  const otpString = otp.join('');

  const handleVerify = async (e) => {
    e?.preventDefault();
    if (otpString.length !== 6) {
      setError('Please enter the full 6‑digit code.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const endpoint = channel === 'phone' ? '/auth/verify-phone-otp' : '/auth/verify-email-otp';
      const payload = channel === 'phone'
        ? { phoneNumber: identifier, otp: otpString }
        : { email: identifier, otp: otpString };

      const response = await apiClient.post(endpoint, payload);
      setMessage(response.data.message || 'Verification successful!');
      // Give user a moment to see success, then call onSuccess
      setTimeout(() => onSuccess?.(response.data), 1000);
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Verification failed. Please try again.';
      setError(errorMessage);
      // Optionally clear OTP on failure
      // setOtp(['', '', '', '', '', '']);
      // inputsRef.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await apiClient.post('/auth/resend-otp', {
        [channel === 'phone' ? 'phoneNumber' : 'email']: identifier,
        channel,
      });
      setMessage(response.data.message || `A new verification code has been sent to your ${channel}.`);
      setResendTimer(60);
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Could not resend code. Please try again later.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Debounced auto‑submit when 6 digits are entered
  useEffect(() => {
    if (otpString.length === 6 && !loading) {
      if (autoSubmitTimerRef.current) {
        clearTimeout(autoSubmitTimerRef.current);
      }
      autoSubmitTimerRef.current = setTimeout(() => {
        handleVerify();
      }, 500); // 500ms delay to allow corrections
    }
    return () => {
      if (autoSubmitTimerRef.current) {
        clearTimeout(autoSubmitTimerRef.current);
      }
    };
  }, [otpString, loading]);

  return (
    <div className="min-h-screen bg-[#F7F9FB] flex items-center justify-center p-4 font-sans antialiased">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-[#4A312F]">Verify your {channel}</h2>
          <p className="text-gray-500 mt-2">
            We've sent a 6‑digit code to<br />
            <span className="font-medium text-[#4A312F]">{identifier}</span>
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl mb-4 flex items-center justify-between">
            <span>{error}</span>
            <button type="button" onClick={() => setError('')} className="text-red-800 font-medium hover:underline">
              OK
            </button>
          </div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl mb-4">
            {message}
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-6">
          <div className="flex justify-center gap-2" onPaste={handlePaste}>
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={el => inputsRef.current[index] = el}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                disabled={loading}
                className="w-12 h-12 text-center text-xl font-semibold border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#D34079] focus:border-[#D34079] disabled:bg-gray-100 transition"
              />
            ))}
          </div>

          <button type="submit" className="hidden" />

          <button
            type="button"
            onClick={handleVerify}
            disabled={loading || otpString.length !== 6}
            className="w-full py-4 bg-[#D34079] text-white font-semibold rounded-xl shadow-sm hover:bg-[#b12f65] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading && <Spinner />}
            {loading ? 'Verifying...' : 'Verify Code'}
          </button>
        </form>

        <div className="mt-6 flex flex-col items-center space-y-3">
          <button
            type="button"
            onClick={handleResend}
            disabled={loading || resendTimer > 0}
            className="text-sm text-[#D34079] hover:underline disabled:opacity-50 disabled:no-underline"
          >
            {resendTimer > 0
              ? `Resend code in ${resendTimer}s`
              : "Didn't receive the code? Resend"}
          </button>

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="text-sm text-[#4A312F] hover:underline"
            >
              ← Back to edit info
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OtpVerification;