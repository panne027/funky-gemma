import { Platform } from 'react-native';

const MODEL_REPO = 'unsloth/functiongemma-270m-it-GGUF';
const MODEL_FILENAME = 'functiongemma-270m-it-Q4_K_M.gguf';
const MODEL_URL = `https://huggingface.co/${MODEL_REPO}/resolve/main/${MODEL_FILENAME}`;

type ProgressCallback = (downloaded: number, total: number) => void;

/**
 * ModelManager: handles downloading and locating the FunctionGemma GGUF model.
 *
 * On first launch, downloads the Q4_K_M quantization (~170MB) from HuggingFace
 * to the app's local document directory. Subsequent launches skip the download.
 */
class ModelManagerService {
  private modelDir = '';
  private modelPath = '';
  private rnfs: any = null;

  async initialize(): Promise<void> {
    try {
      this.rnfs = require('react-native-fs');
      this.modelDir =
        Platform.OS === 'android'
          ? this.rnfs.DocumentDirectoryPath
          : this.rnfs.DocumentDirectoryPath;
      this.modelPath = `${this.modelDir}/${MODEL_FILENAME}`;
    } catch {
      console.warn('[ModelManager] react-native-fs not available');
    }
  }

  async isModelDownloaded(): Promise<boolean> {
    if (!this.rnfs) return false;
    try {
      const exists = await this.rnfs.exists(this.modelPath);
      if (!exists) return false;

      const stat = await this.rnfs.stat(this.modelPath);
      // Reject if file is suspiciously small (incomplete download)
      return stat.size > 50_000_000;
    } catch {
      return false;
    }
  }

  getModelPath(): string {
    return this.modelPath;
  }

  async downloadModel(onProgress?: ProgressCallback): Promise<boolean> {
    if (!this.rnfs) {
      console.error('[ModelManager] Cannot download — react-native-fs unavailable');
      return false;
    }

    console.log(`[ModelManager] Downloading ${MODEL_FILENAME} from HuggingFace...`);

    try {
      const downloadResult = this.rnfs.downloadFile({
        fromUrl: MODEL_URL,
        toFile: this.modelPath,
        background: true,
        discretionary: false,
        cacheable: false,
        progressInterval: 500,
        begin: (res: any) => {
          console.log(`[ModelManager] Download started: ${(res.contentLength / 1e6).toFixed(1)} MB`);
        },
        progress: (res: any) => {
          onProgress?.(res.bytesWritten, res.contentLength);
        },
      });

      const result = await downloadResult.promise;

      if (result.statusCode === 200) {
        const stat = await this.rnfs.stat(this.modelPath);
        console.log(`[ModelManager] Download complete: ${(stat.size / 1e6).toFixed(1)} MB`);
        return true;
      } else {
        console.error(`[ModelManager] Download failed with status ${result.statusCode}`);
        await this.deleteModel();
        return false;
      }
    } catch (err) {
      console.error('[ModelManager] Download error:', err);
      await this.deleteModel();
      return false;
    }
  }

  async deleteModel(): Promise<void> {
    if (!this.rnfs) return;
    try {
      const exists = await this.rnfs.exists(this.modelPath);
      if (exists) await this.rnfs.unlink(this.modelPath);
    } catch {
      // ignore
    }
  }

  getModelInfo() {
    return {
      repo: MODEL_REPO,
      filename: MODEL_FILENAME,
      url: MODEL_URL,
      quantization: 'Q4_K_M',
      estimatedSizeMb: 170,
    };
  }
}

export const modelManager = new ModelManagerService();
