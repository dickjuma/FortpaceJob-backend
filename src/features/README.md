Backend features now live under `src/features/<feature>/`.

Use this layout when editing or adding backend code:

- `controller.js` holds the feature's request handlers
- `routes.js` holds the Express routes for that feature
- `model.js` holds the feature's Mongoose model when one exists
- `service.js` or `cleanup.js` holds feature-specific background logic
- `index.js` re-exports the files inside the feature folder

Examples:

- `src/features/gigs/`
- `src/features/auth/`
- `src/features/users/`
- `src/features/payments/`

Legacy wrappers still exist in `src/models` where needed, but route and controller logic now lives in `src/features` only.
