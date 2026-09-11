/**
 * Recorte de foto 3x4 (proporção 3:4) com upload ou captura pela webcam.
 * Gera um JPEG de 600 × 800 px (equivale a 30 × 40 mm a ~500 dpi), suficiente
 * para o espaço de foto do cartão a 300 dpi.
 */
import { useEffect, useRef, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import Modal from './Modal'
import FilePicker from './FilePicker'
import { fileToDataUrl } from '../lib/api'

const OUT_W = 600
const OUT_H = 800

interface Props {
  onDone: (dataUrl: string) => void
  onClose: () => void
}

export default function PhotoCropper({ onDone, onClose }: Props) {
  const [src, setSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [area, setArea] = useState<Area | null>(null)
  const [camera, setCamera] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!camera) return
    let cancelled = false
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: 'user' }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch((err: unknown) => setError(`Não foi possível acessar a câmera: ${err instanceof Error ? err.message : String(err)}`))
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [camera])

  function capture() {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    const ctx = c.getContext('2d')!
    // Espelha para ficar como no espelho da tela
    ctx.translate(c.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(v, 0, 0)
    setSrc(c.toDataURL('image/jpeg', 0.95))
    setCamera(false)
  }

  async function onFile(file: File) {
    setError(null)
    setSrc(await fileToDataUrl(file))
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setRotation(0)
  }

  async function finish() {
    if (!src || !area) return
    const img = await loadImage(src)
    const rad = (rotation * Math.PI) / 180
    // Canvas com a imagem rotacionada
    const bw = Math.abs(Math.cos(rad) * img.width) + Math.abs(Math.sin(rad) * img.height)
    const bh = Math.abs(Math.sin(rad) * img.width) + Math.abs(Math.cos(rad) * img.height)
    const rc = document.createElement('canvas')
    rc.width = Math.round(bw)
    rc.height = Math.round(bh)
    const rctx = rc.getContext('2d')!
    rctx.translate(bw / 2, bh / 2)
    rctx.rotate(rad)
    rctx.drawImage(img, -img.width / 2, -img.height / 2)
    const out = document.createElement('canvas')
    out.width = OUT_W
    out.height = OUT_H
    const octx = out.getContext('2d')!
    octx.imageSmoothingQuality = 'high'
    octx.fillStyle = '#ffffff'
    octx.fillRect(0, 0, OUT_W, OUT_H)
    octx.drawImage(rc, area.x, area.y, area.width, area.height, 0, 0, OUT_W, OUT_H)
    onDone(out.toDataURL('image/jpeg', 0.92))
  }

  return (
    <Modal title="Foto 3x4" onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn primary" onClick={() => void finish()} disabled={!src || !area}>Usar esta foto</button>
      </>
    }>
      <div className="row" style={{ marginBottom: 10 }}>
        <FilePicker className="btn" accept="image/*" onFile={(f) => void onFile(f)}>Escolher arquivo…</FilePicker>
        <button className="btn" onClick={() => { setError(null); setCamera((c) => !c) }}>{camera ? 'Fechar câmera' : 'Usar webcam'}</button>
        <span className="muted small">Arraste para posicionar; a proporção 3:4 (30 × 40 mm) é mantida automaticamente.</span>
      </div>
      {error && <div className="alert error">{error}</div>}
      {camera && (
        <div className="stack">
          <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', maxHeight: 380, background: '#000', borderRadius: 6, transform: 'scaleX(-1)' }} />
          <div className="row end">
            <button className="btn primary" onClick={capture}>📷 Capturar</button>
          </div>
        </div>
      )}
      {!camera && src && (
        <div className="stack">
          <div className="cropper-area">
            <Cropper image={src} crop={crop} zoom={zoom} rotation={rotation} aspect={3 / 4} onCropChange={setCrop} onZoomChange={setZoom} onRotationChange={setRotation} onCropComplete={(_a, px) => setArea(px)} />
          </div>
          <div className="grid cols-2">
            <label>
              Zoom
              <input type="range" min={1} max={4} step={0.02} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
            </label>
            <label>
              Rotação
              <input type="range" min={-45} max={45} step={1} value={rotation} onChange={(e) => setRotation(Number(e.target.value))} />
            </label>
          </div>
        </div>
      )}
      {!camera && !src && <div className="empty">Escolha um arquivo de imagem ou use a webcam.</div>}
    </Modal>
  )
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Imagem inválida'))
    img.src = src
  })
}
