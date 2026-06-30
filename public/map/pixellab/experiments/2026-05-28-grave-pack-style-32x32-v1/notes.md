# 2026-05-28 Grave Pack Style 32x32 v1

## Goal

Test PixelLab object pack generation using VibeCemetery production tile crops as style references.

## Current Job

- Tool: `create_1_direction_object`
- Object ID: `6619fbde-5c20-4bbe-a88d-5176d7c6c693`
- Status at creation: processing
- Mode: 1-direction review pack
- Size: 32x32
- Candidates expected: 64

## Important Note

The first attempt with multiple style refs failed because one manually supplied base64 payload had incorrect padding. The successful generation used one verified production tombstone style reference. The remaining style refs are saved locally for future calls or manual use.

## Review Step

Run `get_object` for the object ID. If the pack reaches `review`, inspect candidates and keep only the best frames with `select_object_frames`. Accepted outputs should be downloaded into `source/` immediately after selection.
