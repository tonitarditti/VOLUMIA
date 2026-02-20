export type SDXLCannyParams = {
  width: number;
  height: number;
  cannyLow: number;
  cannyHigh: number;
  controlStrength: number;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  denoise: number;
  seed: number;
  checkpointName: string;
  controlNetName: string;
};

type PromptNode = {
  class_type: string;
  inputs: Record<string, unknown>;
};

export type PromptWorkflow = Record<string, PromptNode>;

function sanitizeOutputPrefix(prefix: string) {
  return prefix.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function normalizeSeed(value: number) {
  const parsed = Number.isFinite(value) ? Math.floor(value) : 0;
  return parsed & 0x7fffffff;
}

export function buildSDXLCannyWorkflow(args: {
  inputImage: string;
  prompt: string;
  negative: string;
  outputPrefix: string;
  params: SDXLCannyParams;
}): PromptWorkflow {
  const { params } = args;
  const outputPrefix = sanitizeOutputPrefix(args.outputPrefix);

  return {
    "1": {
      class_type: "LoadImage",
      inputs: {
        image: args.inputImage,
      },
    },
    "2": {
      class_type: "ImageScale",
      inputs: {
        image: ["1", 0],
        upscale_method: "lanczos",
        width: params.width,
        height: params.height,
        crop: "center",
      },
    },
    "3": {
      class_type: "Canny",
      inputs: {
        image: ["2", 0],
        low_threshold: params.cannyLow,
        high_threshold: params.cannyHigh,
      },
    },
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: params.checkpointName,
      },
    },
    "5": {
      class_type: "ControlNetLoader",
      inputs: {
        control_net_name: params.controlNetName,
      },
    },
    "6": {
      class_type: "CLIPTextEncodeSDXL",
      inputs: {
        width: params.width,
        height: params.height,
        crop_w: 0,
        crop_h: 0,
        target_width: params.width,
        target_height: params.height,
        text_g: args.prompt,
        text_l: "",
        clip: ["4", 1],
      },
    },
    "7": {
      class_type: "CLIPTextEncodeSDXL",
      inputs: {
        width: params.width,
        height: params.height,
        crop_w: 0,
        crop_h: 0,
        target_width: params.width,
        target_height: params.height,
        text_g: "",
        text_l: args.negative,
        clip: ["4", 1],
      },
    },
    "8": {
      class_type: "VAEEncode",
      inputs: {
        pixels: ["2", 0],
        vae: ["4", 2],
      },
    },
    "9": {
      class_type: "ControlNetApplyAdvanced",
      inputs: {
        positive: ["6", 0],
        negative: ["7", 0],
        control_net: ["5", 0],
        image: ["3", 0],
        strength: params.controlStrength,
        start_percent: 0,
        end_percent: 1,
      },
    },
    "10": {
      class_type: "KSampler",
      inputs: {
        seed: normalizeSeed(params.seed),
        steps: params.steps,
        cfg: params.cfg,
        sampler_name: params.sampler,
        scheduler: params.scheduler,
        denoise: params.denoise,
        model: ["4", 0],
        positive: ["9", 0],
        negative: ["9", 1],
        latent_image: ["8", 0],
      },
    },
    "11": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["10", 0],
        vae: ["4", 2],
      },
    },
    "12": {
      class_type: "SaveImage",
      inputs: {
        images: ["11", 0],
        filename_prefix: outputPrefix,
      },
    },
  };
}
