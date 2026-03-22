const DEFAULT_COUNTRY_CODE = String(process.env.DEFAULT_COUNTRY_CODE || "+254").trim();

const normalizePhoneNumber = (input = "") => {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (!cleaned) return "";

  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  const digits = cleaned.replace(/[^\d]/g, "");
  if (!digits) return "";

  const countryDigits = DEFAULT_COUNTRY_CODE.replace(/[^\d]/g, "");
  if (digits.startsWith("0") && countryDigits) {
    return `+${countryDigits}${digits.replace(/^0+/, "")}`;
  }
  if (countryDigits && digits.startsWith(countryDigits)) {
    return `+${digits}`;
  }
  return `+${digits}`;
};

const isValidPhoneNumber = (value = "") => /^\+[1-9]\d{7,14}$/.test(String(value || ""));

module.exports = { normalizePhoneNumber, isValidPhoneNumber };
