import type { MetadataRoute } from 'next';
import { supabaseAdmin } from '@/lib/supabase';

// TODO: update when production domain is finalized
const BASE_URL = 'https://vibecemetery.com';

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

  // Cremated → /urn/[id]
  const { data: cremated } = await supabaseAdmin
    .from('cremated')
    .select('id')
    .order('created_at', { ascending: false });

  if (cremated) {
    for (const c of cremated) {
      entries.push({
        url: `${BASE_URL}/urn/${c.id}`,
        changeFrequency: 'weekly',
        priority: 0.5,
      });
    }
  }

  return entries;
}
