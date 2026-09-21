"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { CustomerPickerResult } from "@/features/customers/actions";
import { CustomerCombobox } from "@/features/tickets/components/customer-combobox";

export function CustomerReportPicker({ initialCustomer }: { initialCustomer: CustomerPickerResult | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [selected, setSelected] = useState<CustomerPickerResult | null>(initialCustomer);

  function handleChange(customer: CustomerPickerResult | null) {
    setSelected(customer);
    if (customer) {
      router.push(`${pathname}?customerId=${customer.id}`);
    }
  }

  return (
    <div className="max-w-sm">
      <CustomerCombobox value={selected} onChange={handleChange} />
    </div>
  );
}
