<script setup lang="ts">
import { ref } from 'vue'
import type { UploadFile, UploadFiles } from 'element-plus'

type UploadKind = 'video' | 'data' | 'alarm'
interface UFile { name: string; size: number; type?: string }

const activeTab = ref<UploadKind>('video')
const videoFiles = ref<UFile[]>([])
const dataFiles = ref<UFile[]>([])
const alarmFiles = ref<UFile[]>([])

function filesToUFiles(fileList: UploadFiles): UFile[] {
  return (fileList ?? []).map((f: UploadFile) => ({
    name: f.name,
    size: typeof f.size === 'number' ? f.size : 0,
    type: f.raw?.type
  }))
}

function onVideoChange(_file: UploadFile, fileList: UploadFiles): void { videoFiles.value = filesToUFiles(fileList) }
function onDataChange(_file: UploadFile, fileList: UploadFiles): void { dataFiles.value = filesToUFiles(fileList) }
function onAlarmChange(_file: UploadFile, fileList: UploadFiles): void { alarmFiles.value = filesToUFiles(fileList) }

function clearVideo(): void { videoFiles.value = [] }
function clearData(): void { dataFiles.value = [] }
function clearAlarm(): void { alarmFiles.value = [] }
</script>

<template>
  <section class="upload-page">
    <header class="page-header">
      <h1>上传数据</h1>
      <p class="sub">支持拖拽或点击选择文件，分为：视频上传、数据上传、报警数据上传</p>
    </header>

    <el-card class="upload-card" shadow="hover">
      <el-tabs v-model="activeTab" class="upload-tabs">
        <el-tab-pane label="视频上传" name="video">
          <div class="upload-inline">
            <el-upload
              class="upload-box"
              drag
              action="#"
              :auto-upload="false"
              accept="video/*"
              :on-change="onVideoChange"
            >
              <i class="el-icon-upload" />
              <div class="el-upload__text">拖拽到此或 <em>点击选择视频</em></div>
              <template #tip>
                <div class="el-upload__tip">支持常见视频格式：MP4、MKV、AVI 等</div>
              </template>
            </el-upload>

            <div class="upload-list" v-if="videoFiles.length">
              <div class="list-head">
                <span>已选择 {{ videoFiles.length }} 个文件</span>
                <el-button text type="danger" @click="clearVideo">清空</el-button>
              </div>
              <ul>
                <li v-for="f in videoFiles" :key="'v:' + f.name + ':' + f.size">
                  <span class="name" :title="f.name">{{ f.name }}</span>
                  <span class="size">{{ (f.size / 1024).toFixed(1) }} KB</span>
                </li>
              </ul>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="数据上传" name="data">
          <div class="upload-inline">
            <el-upload
              class="upload-box"
              drag
              action="#"
              :auto-upload="false"
              accept=".csv,.json,.txt"
              :on-change="onDataChange"
            >
              <i class="el-icon-upload" />
              <div class="el-upload__text">拖拽到此或 <em>点击选择数据文件</em></div>
              <template #tip>
                <div class="el-upload__tip">支持 CSV/JSON/TXT 等常见数据格式</div>
              </template>
            </el-upload>

            <div class="upload-list" v-if="dataFiles.length">
              <div class="list-head">
                <span>已选择 {{ dataFiles.length }} 个文件</span>
                <el-button text type="danger" @click="clearData">清空</el-button>
              </div>
              <ul>
                <li v-for="f in dataFiles" :key="'d:' + f.name + ':' + f.size">
                  <span class="name" :title="f.name">{{ f.name }}</span>
                  <span class="size">{{ (f.size / 1024).toFixed(1) }} KB</span>
                </li>
              </ul>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="报警数据上传" name="alarm">
          <div class="upload-inline">
            <el-upload
              class="upload-box"
              drag
              action="#"
              :auto-upload="false"
              accept=".json,.csv"
              :on-change="onAlarmChange"
            >
              <i class="el-icon-upload" />
              <div class="el-upload__text">拖拽到此或 <em>点击选择报警数据</em></div>
              <template #tip>
                <div class="el-upload__tip">支持 JSON/CSV 报警数据格式，字段建议包含：id、time、level、content 等</div>
              </template>
            </el-upload>

            <div class="upload-list" v-if="alarmFiles.length">
              <div class="list-head">
                <span>已选择 {{ alarmFiles.length }} 个文件</span>
                <el-button text type="danger" @click="clearAlarm">清空</el-button>
              </div>
              <ul>
                <li v-for="f in alarmFiles" :key="'a:' + f.name + ':' + f.size">
                  <span class="name" :title="f.name">{{ f.name }}</span>
                  <span class="size">{{ (f.size / 1024).toFixed(1) }} KB</span>
                </li>
              </ul>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </section>
</template>

<style scoped src="./index.scss"></style>