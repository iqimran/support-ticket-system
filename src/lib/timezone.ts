// This project is Bangladesh-specific (see src/lib/phone.ts). All display
// formatting and business-day/month boundary math shares this constant so
// "today"/"this month"/a displayed date all agree, regardless of what
// timezone the server happens to be deployed in.
export const BUSINESS_TIMEZONE = "Asia/Dhaka";
