import { redirect } from 'next/navigation';

// Alias route: redirect /insights directly to /admin/insights

export default function InsightsAliasPage() {
  redirect('/admin/insights');
}
