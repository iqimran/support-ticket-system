// Synthetic data pools for the dev seed — common Bangladeshi given names,
// surnames, and localities, combined at random. These are ordinary,
// widely-shared name components (comparable to using "John Smith" as
// placeholder data in an English-speaking context), never a real person's
// identity or contact details.

export const FIRST_NAMES = [
  "Rahim", "Karim", "Jamal", "Kamal", "Nasir", "Nasrin", "Shirin", "Salma",
  "Momtaz", "Hasan", "Hossain", "Rafiq", "Rafiqul", "Aminul", "Amina",
  "Fatema", "Rubel", "Rubina", "Shakil", "Shakila", "Mizan", "Mizanur",
  "Sultana", "Sultan", "Faruk", "Farida", "Jahangir", "Jahanara", "Alam",
  "Alamgir", "Delwar", "Delwara", "Anwar", "Anwara", "Habib", "Habiba",
  "Yasin", "Yasmin", "Sohel", "Sohela", "Rezaul", "Reza", "Iqbal", "Iqbala",
  "Monir", "Monira", "Zahid", "Zahida", "Liton", "Shamim", "Shamima",
  "Mahmud", "Mahmuda", "Sabbir", "Sabina", "Tariq", "Tania", "Imran",
  "Nadia", "Kabir", "Kabita", "Suman", "Sumaiya", "Raju", "Rojina", "Milon",
  "Babul", "Beauty", "Selim", "Selina", "Nazrul", "Nazma", "Wahid", "Wahida",
] as const;

export const LAST_NAMES = [
  "Islam", "Ahmed", "Hossain", "Rahman", "Khan", "Chowdhury", "Akter",
  "Begum", "Uddin", "Miah", "Molla", "Sarkar", "Talukder", "Bhuiyan",
  "Sheikh", "Mridha", "Pramanik", "Munshi", "Sardar", "Biswas",
] as const;

export const AREAS = [
  "Dhanmondi, Dhaka", "Gulshan, Dhaka", "Banani, Dhaka", "Mirpur, Dhaka",
  "Uttara, Dhaka", "Mohammadpur, Dhaka", "Badda, Dhaka", "Rampura, Dhaka",
  "Khilgaon, Dhaka", "Jatrabari, Dhaka", "Agrabad, Chittagong",
  "Nasirabad, Chittagong", "Pahartali, Chittagong", "Zindabazar, Sylhet",
  "Amberkhana, Sylhet", "Boalia, Rajshahi", "Shaheb Bazar, Rajshahi",
  "Khulshi, Chittagong", "Savar, Dhaka", "Tongi, Gazipur",
] as const;

const HOUSE_TEMPLATES = [
  (n: number) => `House ${n}, Road ${(n % 15) + 1}`,
  (n: number) => `Flat ${(n % 9) + 1}${["A", "B", "C"][n % 3]}, Building ${n}`,
  (n: number) => `Shop ${n}, Market Road`,
  (n: number) => `Holding No. ${n}`,
] as const;

export function buildAddress(rng: () => number, houseSeed: number): string {
  const template = HOUSE_TEMPLATES[houseSeed % HOUSE_TEMPLATES.length]!;
  const area = AREAS[Math.floor(rng() * AREAS.length)]!;
  return `${template(houseSeed)}, ${area}`;
}

/** The eleven required CCTV problem categories, plus enough camera/location detail to read as real tickets rather than a repeated label. */
export const CCTV_PROBLEMS = [
  "Camera offline",
  "DVR not recording",
  "NVR storage full",
  "Remote viewing not working",
  "Camera image blurry",
  "Power issue",
  "Network issue",
  "HDD replacement",
  "Camera replacement",
  "Mobile app configuration",
  "Recording playback issue",
] as const;

export const CAMERA_LOCATIONS = [
  "main entrance", "parking area", "back gate", "reception", "warehouse floor",
  "cash counter", "rooftop", "server room", "staff room", "loading dock",
  "front gate", "corridor", "shop floor", "office room",
] as const;

export function buildProblemDescription(rng: () => number): string {
  const problem = CCTV_PROBLEMS[Math.floor(rng() * CCTV_PROBLEMS.length)]!;
  if (rng() < 0.25) return problem; // some tickets are just the bare category, like a quick phone-in report
  const cameraNumber = Math.floor(rng() * 8) + 1;
  const location = CAMERA_LOCATIONS[Math.floor(rng() * CAMERA_LOCATIONS.length)]!;
  return `${problem} - Camera ${cameraNumber} (${location})`;
}

export const PROGRESS_NOTES = [
  "Called the customer to confirm the visit schedule.",
  "Technician dispatched to site.",
  "Site visit completed, issue diagnosed.",
  "Replacement part ordered from supplier.",
  "Customer requested a follow-up visit next week.",
  "Kaj shuru hoyeche, customer ke update deya hoyeche.",
  "Customer bolche shomossha ta prai thik hoye geche.",
  "Waiting on customer confirmation to proceed.",
  "DVR firmware updated during visit.",
  "Cable re-routing done to fix intermittent signal.",
  "Power adapter replaced.",
  "Router restarted, connectivity restored.",
  "Escalated to senior technician for review.",
  "Parts unavailable locally, ordered from Dhaka.",
  "Customer complained again about the same issue.",
  "Issue reproduced on-site, root cause identified.",
  "Final testing completed, all cameras online.",
  "Customer will pay upon completion.",
] as const;

export const CANCEL_REASONS = [
  "Customer no longer needs service.",
  "Customer found another technician.",
  "Duplicate ticket, closing.",
  "Customer unreachable after multiple attempts.",
  "Customer postponed indefinitely.",
] as const;

export const REOPEN_REASONS = [
  "Customer reported the same issue again.",
  "Issue recurred after a few days.",
  "Additional fault found during follow-up visit.",
] as const;

export const PAYMENT_METHODS = ["CASH", "BANK", "MOBILE_BANKING", "OTHER"] as const;
