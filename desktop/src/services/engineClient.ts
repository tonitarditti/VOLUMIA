import axios from 'axios'

const API_BASE = 'http://127.0.0.1:7860'

export interface JobStatus {
  id: string
  state: string
  progress: number
  message: string
  logs: string[]
  outputs: Record<string, string>
  error?: string
}

export const engineClient = {
  async createJob(
    images: File[],
    preset: string,
    units: string,
    detail: string,
    outputObj: boolean,
    outputGlb: boolean,
    textures: boolean
  ): Promise<{ id: string }> {
    const formData = new FormData()

    // Add form fields
    formData.append('preset', preset)
    formData.append('units', units)
    formData.append('detail', detail)
    formData.append('output_obj', outputObj.toString())
    formData.append('output_glb', outputGlb.toString())
    formData.append('textures', textures.toString())

    // Add images
    images.forEach((img) => {
      formData.append('images', img)
    })

    const response = await axios.post<{ id: string }>(`${API_BASE}/jobs`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })

    return response.data
  },

  async getJobStatus(jobId: string): Promise<JobStatus> {
    const response = await axios.get<JobStatus>(`${API_BASE}/jobs/${jobId}`)
    return response.data
  },

  async cancelJob(jobId: string): Promise<void> {
    await axios.post(`${API_BASE}/jobs/${jobId}/cancel`)
  },

  async downloadJob(jobId: string): Promise<Blob> {
    const response = await axios.get(`${API_BASE}/jobs/${jobId}/download`, {
      responseType: 'blob',
    })
    return response.data
  },

  async getHealth(): Promise<Record<string, unknown>> {
    const response = await axios.get(`${API_BASE}/health`)
    return response.data
  },
}
