# APEX DRIVE — Browser 3D driving prototype

A static browser project built with Three.js. It includes a procedural 3D city road, a custom procedural sports-car model, keyboard controls, a touch steering wheel, accelerator/brake controls, a driving HUD, and graphics quality presets.

## Run locally

Because the project uses JavaScript ES modules, serve this folder from a local HTTP server rather than opening `index.html` as a `file://` URL.

For example, with Node.js installed:

```bash
npx serve .
```

Then open the local URL printed by the server.

## Deploy

Upload the contents of this folder to the root of a static hosting project (for example, a GitHub repository connected to a static host). No build step is required.

## Notes

- The generated cover image is used on the landing screen only; the playable city and car are procedural 3D geometry.
- This is a playable first prototype, not a finished AAA racing game. Higher fidelity requires dedicated optimized `.glb` car/environment assets, richer road systems, traffic AI, audio, and more advanced vehicle physics.
- Three.js is imported from jsDelivr at runtime. A network connection is required to load it.
