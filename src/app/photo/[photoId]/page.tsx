import { type Metadata } from 'next';
import { redirect } from 'next/navigation';
import { photoService } from '@/server/service/photo-service';
import { getPhotoDeviceParams } from '@/lib/viewer-field';

interface PhotoDetailPageProps {
  params: Promise<{ photoId: string }>;
}

// Dynamic OpenGraph and Twitter meta tags for direct photo links
export async function generateMetadata({ params }: PhotoDetailPageProps): Promise<Metadata> {
  const { photoId } = await params;
  const appName = process.env.TITLE || 'NayPict';

  try {
    const photo = await photoService.getById(photoId);
    if (!photo) {
      return {
        title: `Photo Not Found | ${appName}`,
        description: 'The requested photo does not exist or has been removed.',
      };
    }

    const deviceParams = getPhotoDeviceParams(photo.exif);
    const camera = deviceParams.find((p) => p.key === 'camera')?.value;
    const takenTime = photo.takenTime ? photo.takenTime.slice(0, 10) : '';

    const descParts = [
      photo.name,
      camera ? `Shot with ${camera}` : '',
      takenTime ? `on ${takenTime}` : '',
      photo.width && photo.height ? `(${photo.width} × ${photo.height})` : '',
    ].filter(Boolean);

    const description = descParts.join(' • ') || `View high resolution photo on ${appName}`;

    return {
      title: `${photo.name} | ${appName}`,
      description,
      openGraph: {
        title: photo.name,
        description,
        type: 'article',
        siteName: appName,
      },
      twitter: {
        card: 'summary_large_image',
        title: photo.name,
        description,
      },
    };
  } catch (err) {
    console.error('generateMetadata error for photo:', err);
    return {
      title: `Photo | ${appName}`,
      description: `View high resolution photography on ${appName}`,
    };
  }
}

// Redirect canonical /photo/[photoId] direct links to the main photo viewer
export default async function PhotoDetailPage({ params }: PhotoDetailPageProps) {
  const { photoId } = await params;
  redirect(`/photos?photoId=${encodeURIComponent(photoId)}`);
}
