import { redirect } from 'next/navigation';

interface PhotoDetailPageProps {
  params: Promise<{ photoId: string }>;
}

// Redirect canonical /photo/[photoId] direct links to the main photo viewer
export default async function PhotoDetailPage({ params }: PhotoDetailPageProps) {
  const { photoId } = await params;
  redirect(`/photos?photoId=${encodeURIComponent(photoId)}`);
}
