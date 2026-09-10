'use client';

import { useState } from 'react';
import RektGraveCard from './RektGraveCard';
import type { RektMemorialData } from './RektMemorial';

export default function RektGravePreview({ data, initialRespects = 0 }: { data: RektMemorialData; initialRespects?: number }) {
  const [voted, setVoted] = useState(false);
  const [status, setStatus] = useState('');
  return <RektGraveCard data={data} respects={initialRespects + Number(voted)} voted={voted}
    onRespect={() => { setVoted(true); setStatus('Preview only. This respect is not saved.'); }}
    onBurn={() => setStatus('Preview only. No wallet opens and no GRAVE is burned.')}
    onShare={() => setStatus('Preview only. This example has no public grave link yet.')}
    onFind={() => setStatus('Preview only. This example has no plot on the map.')}
    status={status} />;
}
