import { Router, Response, Request } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const router = Router();

router.post('/sync-repositories', async (req: Request, res: Response) => {
  const isWin = process.platform === 'win32';
  
  // Absolute paths for local workspaces
  const tk1Path = 'D:\\ki7\\EXE\\TK1';
  const tk2Path = 'D:\\ki7\\EXE\\TK2\\vivu-planner';

  try {
    console.log('[Dev Sync API] Starting local synchronization from TK1 to TK2...');
    
    // 1. Copy local files excluding .git and node_modules
    const copyCmd = isWin 
      ? `powershell -Command "Copy-Item -Path '${tk1Path}\\*' -Destination '${tk2Path}' -Recurse -Force -Exclude .git,node_modules"`
      : `rsync -av --exclude '.git' --exclude 'node_modules' ${tk1Path}/ ${tk2Path}/`;
      
    await execAsync(copyCmd);
    console.log('[Dev Sync API] File copying finished.');

    // 2. Configure identity, stage, commit and push in TK2 repository
    console.log('[Dev Sync API] Staging, committing and pushing to TK2 GitHub remote...');
    const gitCmd = isWin
      ? `cd /d "${tk2Path}" && git config user.email "vinhvip4508@gmail.com" && git config user.name "vinh-not-bot" && git add . && git commit -m "Dong bo ma nguon MVP ViVu Planner tu TK1: frontend, backend, AI va Places" && git push origin main --force`
      : `cd ${tk2Path} && git config user.email "vinhvip4508@gmail.com" && git config user.name "vinh-not-bot" && git add . && git commit -m "Dong bo ma nguon MVP ViVu Planner tu TK1: frontend, backend, AI va Places" && git push origin main --force`;
      
    const { stdout, stderr } = await execAsync(gitCmd);
    console.log('[Dev Sync API] Git push complete.', stdout, stderr);
    
    return res.json({
      success: true,
      message: 'Đồng bộ mã nguồn cục bộ và thực hiện push sang TK2 thành công!',
      log: stdout || stderr
    });
  } catch (error: any) {
    console.error('[Dev Sync API] Synchronization failed:', error.message);
    return res.status(500).json({
      error: 'Không thể đồng bộ cục bộ và push sang TK2',
      details: error.message
    });
  }
});

import { supabaseAdmin } from '../services/supabaseAdmin';

router.get('/db-check', async (req: Request, res: Response) => {
  try {
    const { data: selectData, error: selectError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .limit(1);

    const { data: columnsInfo, error: columnsError } = await supabaseAdmin
      .rpc('get_profiles_columns'); // fallback in case we can use RPC, or just inspect selectData

    const sampleRow = selectData && selectData.length > 0 ? selectData[0] : null;
    const columns = sampleRow ? Object.keys(sampleRow) : [];

    // Test inserting a dummy profile with trips_used and custom_quota
    const testId = '00000000-0000-0000-0000-000000000009'; // dummy UUID
    const { error: insertError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: testId,
        trips_used: 1,
        custom_quota: 3,
        is_premium: false
      });

    // Delete dummy if inserted
    if (!insertError) {
      await supabaseAdmin.from('profiles').delete().eq('id', testId);
    }

    return res.json({
      success: true,
      selectError: selectError ? selectError.message : null,
      columns,
      sampleRow,
      insertTestError: insertError ? insertError.message : 'No error (Insert succeeded!)'
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
