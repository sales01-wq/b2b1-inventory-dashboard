import {useState} from 'react';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {FileInput} from '@astryxdesign/core/FileInput';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {ArrowPathIcon} from '@heroicons/react/16/solid';
import {Selector} from '@astryxdesign/core/Selector';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';
import {PageFrame} from './PageFrame';
import {MessageBanner} from '../app/StatusBanners';
import {useStore} from '../app/useStore';
import {emit} from '../lib/store.js';
import {SHEET_SIGNATURES} from '../lib/parse.js';
import {unresolvedFiles, handleFiles, applyUploadedData} from '../lib/upload.js';
import {uploadDoneText} from '../lib/views.js';
import {shared, refreshFromGoogleSheet} from '../data/shared.js';
import {DEMO, loadDemoData} from '../app/demo';

const SHEET_OPTIONS = SHEET_SIGNATURES.map((s: {key: string; label: string}) => ({value: s.key, label: s.label}));
const sigLabel = (k: string) => (SHEET_SIGNATURES.find((s: {key: string}) => s.key === k) || {}).label;
let uploadMsg = ''; // 기존 #uploadStatus 에 남던 완료 문구 (다른 화면에 다녀와도 유지)

export function DataPage() {
  useStore();
  return (
    <PageFrame view="data">
      <VStack gap={4}>
        {shared.active ? <SharedPanel /> : <SheetPanel />}
        <UploadPanel />
      </VStack>
    </PageFrame>
  );
}

/** 로그인 모드: 공유 데이터 안내 (기존 #sharedInfoPanel) */
function SharedPanel() {
  return (
    <Card>
      <VStack gap={2}>
        <Heading level={2}>공유 데이터 (구글 로그인)</Heading>
        <ul className="help-list">
          <li><Text type="body" color="secondary">로그인한 회사 계정은 모두 같은 최신 데이터를 봅니다.</Text></li>
          <li><Text type="body" color="secondary">업데이트 권한이 있는 담당자가 ERP 엑셀을 업로드 폴더에 올리고 <Text type="body" weight="semibold" color="primary">새로고침</Text>을 누르면 모든 사용자에게 반영됩니다.</Text></li>
          <li><Text type="body" color="secondary">다른 사람이 업데이트하면 상단에 "새 데이터가 있습니다" 알림이 뜹니다.</Text></li>
        </ul>
        {shared.infoText && <Text type="supporting">{shared.infoText}</Text>}
      </VStack>
    </Card>
  );
}

/** 로컬 모드: Apps Script 웹앱으로 가져오기 (기존 #gsPanel) */
function SheetPanel() {
  return (
    <Card>
      <VStack gap={3}>
        <Heading level={2}>구글시트 자동 연결</Heading>
        <ul className="help-list">
          <li><Text type="body" color="secondary">Apps Script를 웹 앱으로 배포해두면, 헤더의 <Text type="body" weight="semibold" color="primary">새로고침</Text> 버튼 한 번으로 그 웹앱을 통해 최신 데이터를 바로 가져옵니다.</Text></li>
          <li><Text type="body" color="secondary">아래 파일 업로드는 이 방법 대신 쓰거나, 이 방법이 안 될 때 백업용으로 쓰시면 됩니다.</Text></li>
        </ul>
        <HStack gap={2} vAlign="end" wrap="wrap">
          <div style={{flex: '1 1 420px'}}>
            <TextInput
              label="Apps Script 웹앱 URL"
              value={shared.gsUrl}
              onChange={v => { shared.gsUrl = v; emit(); }}
              placeholder="예: https://script.google.com/macros/s/AKfycb.../exec"
              description='Apps Script에서 "배포 → 새 배포 → 웹 앱 (액세스 권한: 모든 사용자)"로 배포하면 생기는 주소입니다.'
            />
          </div>
          <Button label="지금 가져오기" icon={<ArrowPathIcon width={14} height={14} aria-hidden />} variant="primary" isLoading={shared.gsLoading} onClick={() => (DEMO ? loadDemoData() : refreshFromGoogleSheet(shared.gsUrl))} />
        </HStack>
        {shared.gsStatus && <MessageBanner msg={shared.gsStatus} />}
      </VStack>
    </Card>
  );
}

/** CSV / 엑셀 수동 업로드 (기존 dropzone + #uploadStatus) */
function UploadPanel() {
  const [reading, setReading] = useState(false);
  const onFiles = async (files: File | File[] | null) => {
    if (!files) return;
    uploadMsg = '';
    setReading(true);
    await handleFiles(Array.isArray(files) ? files : [files]);
    setReading(false);
    emit();
  };
  const apply = () => {
    const r = applyUploadedData('upload');
    uploadMsg = r.updatedList ? uploadDoneText(r) : '';
    emit({applied: r, mode: 'upload'});
  };
  return (
    <Card>
      <VStack gap={3}>
        <Heading level={2}>CSV / 엑셀 업로드 (백업용 수동 업로드)</Heading>
        {/* 기존 안내 문단의 내용을 그대로 세 항목으로 나눔 */}
        <ul className="help-list">
          <li><Text type="body" color="secondary">구글 시트에서 CSV로 각 탭을 내려받아 올리거나, <Text type="body" weight="semibold" color="primary">엑셀 파일(.xlsx)을 통째로</Text> 올려도 됩니다. 엑셀 안에 시트가 여러 개 있어도 각 시트를 자동으로 인식합니다.</Text></li>
          <li><Text type="body" color="secondary">파일 이름과 상관없이 <Text type="body" weight="semibold" color="primary">내용을 보고 어떤 탭인지 자동으로 인식</Text>합니다: 가용재고조회 · 제품일정표 · 일자별판매실적분석 · 유통기한(선택) · 상품마스터(선택).</Text></li>
          <li><Text type="body" color="secondary">한 번 올린 뒤에는 <Text type="body" weight="semibold" color="primary">바뀐 파일만 다시 올리면 됩니다.</Text> 예: 가용재고조회만 새로 올리면 제품일정표 · 판매실적 등은 이전 데이터가 그대로 유지됩니다.</Text></li>
        </ul>
        <FileInput
          label="CSV 또는 엑셀 파일"
          isLabelHidden
          mode="dropzone"
          isMultiple
          accept=".csv,.xlsx,.xls"
          placeholder="CSV 또는 엑셀 파일을 여기로 끌어다 놓거나 클릭해서 선택하세요"
          value={null}
          onChange={onFiles}
        />
        {reading && <Text type="supporting">파일을 읽는 중...</Text>}
        {/* 완료 안내: 옅은 초록 상자 + 아이콘 (히어로 알람과 같은 모양) */}
        {uploadMsg && (
          <div className="alert alert-ok" role="status">
            <HStack gap={2} vAlign="center">
              <Icon icon="success" color="success" size="sm" />
              <Text type="label">{uploadMsg}</Text>
            </HStack>
          </div>
        )}
        {unresolvedFiles.length > 0 && (
          <VStack gap={2}>
            {unresolvedFiles.map((f: {fileName: string; key: string | null; error?: boolean; errorMsg?: string}, i: number) => (
              <HStack key={i} gap={3} vAlign="center" wrap="wrap" className="file-row">
                <Text type="body" weight="medium">{f.fileName}</Text>
                {f.error ? (
                  <>
                    <Badge variant="orange" label="읽기 실패" />
                    <Text type="supporting">{f.errorMsg || ''}</Text>
                  </>
                ) : (
                  <>
                    <Badge variant={f.key ? 'green' : 'orange'} label={f.key ? '인식됨: ' + sigLabel(f.key) : '자동 인식 실패 — 직접 선택'} />
                    <div style={{minWidth: 200}}>
                      <Selector
                        label="시트 종류"
                        isLabelHidden
                        size="sm"
                        placeholder="-- 시트 선택 --"
                        options={SHEET_OPTIONS}
                        value={f.key || undefined}
                        onChange={v => { f.key = v || null; emit(); }}
                      />
                    </div>
                  </>
                )}
              </HStack>
            ))}
            <HStack gap={2}>
              <Button label="대시보드에 적용" variant="primary" onClick={apply} />
              <Button label="목록 지우기" variant="secondary" onClick={() => { unresolvedFiles.length = 0; emit(); }} />
            </HStack>
          </VStack>
        )}
      </VStack>
    </Card>
  );
}
