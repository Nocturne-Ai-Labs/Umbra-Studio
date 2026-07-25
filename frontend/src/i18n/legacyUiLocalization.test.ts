import { describe, expect, test } from 'bun:test';
import { translateLegacyUiText } from './legacyUiLocalization';

describe('legacy Japanese UI localization', () => {
  test('translates shared controls and workspace terminology', () => {
    expect(translateLegacyUiText('ja', 'Save')).toBe('保存');
    expect(translateLegacyUiText('ja', 'Queue Manager')).toBe('キュー管理');
    expect(translateLegacyUiText('ja', 'Add Detailer')).toBe('ディテーラーを追加');
    expect(translateLegacyUiText('ja', 'Send to Inpaint')).toBe('インペイントへ送る');
  });

  test('translates dynamic counters and positions', () => {
    expect(translateLegacyUiText('ja', '12 images')).toBe('12 画像');
    expect(translateLegacyUiText('ja', 'Running 2 of 25')).toBe('実行中 2 / 25');
    expect(translateLegacyUiText('ja', '3 media, 2 folders')).toBe('3 メディア、2 フォルダー');
    expect(translateLegacyUiText('ja', 'SDXL - 3:4 portrait 896x1152')).toBe('SDXL - 3:4 縦長 896x1152');
    expect(translateLegacyUiText('ja', 'Position 4')).toBe('位置 4');
  });

  test('preserves prompts, paths, models, and unsupported text', () => {
    expect(translateLegacyUiText('ja', '1girl, red jacket, city at night')).toBe('1girl, red jacket, city at night');
    expect(translateLegacyUiText('ja', 'D:/Models/anima-xl.safetensors')).toBe('D:/Models/anima-xl.safetensors');
    expect(translateLegacyUiText('ja', 'anima-xl.safetensors')).toBe('anima-xl.safetensors');
  });

  test('keeps English unchanged', () => {
    expect(translateLegacyUiText('en', 'Queue Manager')).toBe('Queue Manager');
  });
});

describe('legacy Simplified Chinese UI localization', () => {
  test('translates shared controls and workspace terminology', () => {
    expect(translateLegacyUiText('zh-CN', 'Save')).toBe('保存');
    expect(translateLegacyUiText('zh-CN', 'Queue Manager')).toBe('队列管理器');
    expect(translateLegacyUiText('zh-CN', 'Add Detailer')).toBe('添加细化器');
    expect(translateLegacyUiText('zh-CN', 'Send to Inpaint')).toBe('发送到局部重绘');
  });

  test('translates dynamic counters, positions, and resolution labels', () => {
    expect(translateLegacyUiText('zh-CN', '12 images')).toBe('12 图片');
    expect(translateLegacyUiText('zh-CN', 'Running 2 of 25')).toBe('运行中 2 / 25');
    expect(translateLegacyUiText('zh-CN', '3 media, 2 folders')).toBe('3 媒体，2 文件夹');
    expect(translateLegacyUiText('zh-CN', 'SDXL - 3:4 portrait 896x1152')).toBe('SDXL - 3:4 竖向 896x1152');
    expect(translateLegacyUiText('zh-CN', 'Position 4')).toBe('位置 4');
  });

  test('preserves user-authored and technical values', () => {
    expect(translateLegacyUiText('zh-CN', '1girl, red jacket, city at night')).toBe('1girl, red jacket, city at night');
    expect(translateLegacyUiText('zh-CN', 'D:/Models/anima-xl.safetensors')).toBe('D:/Models/anima-xl.safetensors');
    expect(translateLegacyUiText('zh-CN', 'anima-xl.safetensors')).toBe('anima-xl.safetensors');
  });
});

describe('legacy Korean UI localization', () => {
  test('translates shared controls and workspace terminology', () => {
    expect(translateLegacyUiText('ko', 'Save')).toBe('저장');
    expect(translateLegacyUiText('ko', 'Queue Manager')).toBe('대기열 관리자');
    expect(translateLegacyUiText('ko', 'Add Detailer')).toBe('디테일러 추가');
    expect(translateLegacyUiText('ko', 'Send to Inpaint')).toBe('인페인트로 보내기');
  });

  test('translates dynamic counters, positions, and resolution labels', () => {
    expect(translateLegacyUiText('ko', '12 images')).toBe('12 이미지');
    expect(translateLegacyUiText('ko', 'Running 2 of 25')).toBe('실행 중 2 / 25');
    expect(translateLegacyUiText('ko', '3 media, 2 folders')).toBe('3 미디어, 2 폴더');
    expect(translateLegacyUiText('ko', 'SDXL - 3:4 portrait 896x1152')).toBe('SDXL - 3:4 세로 896x1152');
    expect(translateLegacyUiText('ko', 'Position 4')).toBe('위치 4');
  });

  test('preserves user-authored and technical values', () => {
    expect(translateLegacyUiText('ko', '1girl, red jacket, city at night')).toBe('1girl, red jacket, city at night');
    expect(translateLegacyUiText('ko', 'D:/Models/anima-xl.safetensors')).toBe('D:/Models/anima-xl.safetensors');
    expect(translateLegacyUiText('ko', 'anima-xl.safetensors')).toBe('anima-xl.safetensors');
  });
});
