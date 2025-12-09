const cp = require('child_process')
const path = require('path')
const fs = require('fs')

if (process.env.SKIP_POSTINSTALL_REBUILD === '1') process.exit(0)

function run(cmd, args) {
  return cp.spawnSync(cmd, args, { stdio: 'inherit', shell: true })
}

function hasPython() {
  try {
    const r = run('python', ['--version'])
    return r.status === 0
  } catch (e) {
    return false
  }
}

function getElectronVersion() {
  try {
    const p = require('electron/package.json')
    return p.version
  } catch (e) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'))
      const v = pkg.devDependencies && pkg.devDependencies.electron
      return typeof v === 'string' ? v.replace(/^[^0-9]*/, '') : ''
    } catch (_) {
      return ''
    }
  }
}

if (!hasPython()) {
  console.log('postinstall: python not found; skipping native rebuild')
  process.exit(0)
}

const ver = getElectronVersion()
const args = ['@electron/rebuild', '--force', '--only', 'serialport']
if (ver) args.push('--version', ver)

let r = run('npx', args)
if (r.status !== 0) {
  r = run('npx', ['electron-builder', 'install-app-deps'])
}
process.exit(0)

