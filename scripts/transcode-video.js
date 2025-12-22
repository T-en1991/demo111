#!/usr/bin/env node
const { spawn } = require('child_process')
const path = require('path')

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = { input: null, output: null, preset: 'veryfast', crf: 23 }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--input' && args[i + 1]) opts.input = args[++i]
    else if (a === '--output' && args[i + 1]) opts.output = args[++i]
    else if (a === '--preset' && args[i + 1]) opts.preset = args[++i]
    else if (a === '--crf' && args[i + 1]) opts.crf = Number(args[++i])
  }
  if (!opts.input) {
    console.error('Usage: node scripts/transcode-video.js --input <path> [--output <path>] [--preset veryfast] [--crf 23]')
    process.exit(1)
  }
  if (!opts.output) {
    const base = path.basename(opts.input).replace(/\.[^.]+$/, '')
    opts.output = path.join(path.dirname(opts.input), base + '_h264.mp4')
  }
  return opts
}

function runFFmpeg({ input, output, preset, crf }) {
  const args = [
    '-y',
    '-i', input,
    '-c:v', 'libx264',
    '-preset', preset,
    '-crf', String(crf),
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    output
  ]
  console.log(`ffmpeg ${args.join(' ')}`)
  const child = spawn('ffmpeg', args, { stdio: 'inherit' })
  child.on('exit', (code) => {
    if (code === 0) {
      console.log(`Transcode done: ${output}`)
    } else {
      console.error(`ffmpeg exited with code ${code}`)
      process.exit(code || 1)
    }
  })
}

const opts = parseArgs()
runFFmpeg(opts)

