import { redirect } from 'next/navigation';

export default function FinancieenPage() {
  redirect('/kosten?tab=overview');
}
