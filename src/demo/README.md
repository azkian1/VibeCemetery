# Local Demo Mode

Local cemetery data for demo and recording builds.

Enable with:

```powershell
$env:NEXT_PUBLIC_VIBECEMETERY_DEMO="1"; npm run dev
```

What it does:

- Seeds `/api/graves` with 28 local demo graves.
- Seeds NextAuth with a connected `demo-gravedigger` GitHub identity.
- Returns 10 fake dead repos from `/api/github/scan`.
- Lets SHOVEL burial and FIRE cremation write in memory only.

Cleanup after recording:

- Stop setting `NEXT_PUBLIC_VIBECEMETERY_DEMO=1`.
- Demo code is inert unless the flag is exactly `1`.
- Demo mode is disabled in production builds so the public demo flag cannot enable unauthenticated demo API writes.
