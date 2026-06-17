import { Router, Response, Request } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const router = Router();

router.post('/sync-repositories', async (req: Request, res: Response) => {
  const tempDir = `temp-sync-${Date.now()}`;
  const isWin = process.platform === 'win32';
  
  try {
    console.log(`[Dev Sync] Starting repository sync. Temporary folder: ${tempDir}`);
    
    // 1. Clone from TK1
    console.log('[Dev Sync] Cloning from TK1 repository...');
    await execAsync(`git clone https://github.com/MTV-2602/vivu-planner.git ${tempDir}`);
    
    // 2. Set remote, configure user, and push
    console.log('[Dev Sync] Configuring user identity, setting remote, and pushing to TK2...');
    const gitCmd = `cd ${tempDir} && git config user.email "vinhvip4508@gmail.com" && git config user.name "vinh-not-bot" && git remote set-url origin https://github.com/vinh-not-bot/vivu-planner.git && git push origin main --force`;
    const { stdout, stderr } = await execAsync(gitCmd);
    
    console.log('[Dev Sync] Push output:', stdout, stderr);
    
    // 3. Clean up
    console.log('[Dev Sync] Cleaning up temporary directory...');
    const cleanCmd = isWin ? `rmdir /s /q ${tempDir}` : `rm -rf ${tempDir}`;
    await execAsync(cleanCmd);
    
    return res.json({
      success: true,
      message: 'Đồng bộ mã nguồn từ TK1 (MTV-2602) sang TK2 (vinh-not-bot) thành công!',
      log: stdout || stderr
    });
  } catch (error: any) {
    console.error('[Dev Sync] Sync failed:', error.message);
    
    // Attempt cleanup if failed
    try {
      const cleanCmd = isWin ? `rmdir /s /q ${tempDir}` : `rm -rf ${tempDir}`;
      await execAsync(cleanCmd);
    } catch (cleanupErr) {
      // Ignore cleanup error
    }
    
    return res.status(500).json({
      error: 'Không thể đồng bộ repositories',
      details: error.message
    });
  }
});

export default router;
