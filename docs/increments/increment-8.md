# Increment 8: hosted preview image

Status: full Horton checks, Triptych's external-launch browser proof and
independent Astra review pass. Public publication and browser qualification
remain.

This increment packages the accepted `HORTON.COM` into a Triptych CP/M system
disk and publishes it through GitHub Pages as a static image plus
`triptych-external-system-v1` descriptor. A direct Triptych URL loads the
descriptor, verifies the image size and SHA-256, checks the resident system,
then boots to CCP with Horton available on A:.

The image is based on Triptych's retained `system-2m-n04` image from revision
`62f49d7fada9e5bf714f175ef992d8e89cffbc8a`. The added `HORTON.COM` is 10,854
bytes with SHA-256
`2b9fcfc03157794402aa7ac51198ac6d29df43a00a57bcabc18b2409b79d5a2c`.
The preview image is 2,097,152 bytes with SHA-256
`767865e340dfea082371f9dd20044f36feaafba8133e0f7625c44c3baae01a49`.

The preview uses the four-drive `triptych-cpu-v0.1-2m-n04` profile. Its
descriptor requests persistent writable media on B:, C: and D:. Triptych mounts
the immutable image on A:, seeds B: from the image with the resident system
tracks cleared, and creates blank persistent disks for C: and D:. This satisfies
Horton's startup scan and its current A:–D: assumption from one link.

Acceptance requires the full `npm run check`, Triptych's external-launch
browser test, the Pages integrity check, an independent Astra review, and
opening the public Triptych link in a fresh browser to start HORTON and confirm
that the two panels can browse A: through D:. This software proof does not
establish physical Triptych hardware behavior.
