import type { MetadataRoute } from 'next';
import { supabaseAdmin } from '@/lib/supabase';
import { getSiteUrl } from '@/lib/site';

const BASE_URL = getSiteUrl();

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      changeFrequency: 'daily',
      priority: 1,
    },
  ];

  // Graves → /grave/[id]
  const { data: graves } = await supabaseAdmin
    .from('graves')
    .select('id')
    .order('created_at', { ascending: false });

  if (graves) {
    for (const g of graves) {
      entries.push({
        url: `${BASE_URL}/grave/${g.id}`,
        changeFrequency: 'weekly',
        priority: 0.7,
      });
    }
  }

  return entries;
}
