**Purpose**
- Prepare Windows for building Electron native modules like `serialport`.

**Install Tools**
- Install Python 3 (x64) and ensure `python` is in PATH.
- Install Visual Studio Build Tools 2022 with "Desktop development with C++" and Windows 10/11 SDK.

**Configure npm**
- `npm config set python "C:\\Path\\To\\python.exe"`
- `npm config set msvs_version 2022`

**Rebuild Native Modules**
- `npm i` or `npm i --ignore-scripts`
- `npx @electron/rebuild --force --version=38.5.0 --only serialport --arch=x64`
- `npx electron-builder install-app-deps`

**Run And Verify**
- `npm run dev` to start the app.
- `npm run build:win` to build installer.

**Notes**
- Mirrors are configured in `electron-builder.yml`.
- If install should skip rebuild: set `SKIP_POSTINSTALL_REBUILD=1`.
