// webcam-client/src/App.js
import React, { useEffect, useRef, useState } from "react";

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef(null);

  // Flask에서 받은 faces 정보 저장
  const [faces, setFaces] = useState([]);

  // 1️⃣ 웹캠 열기
  useEffect(() => {
    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error accessing webcam:", err);
      }
    }
    setupCamera();

    // cleanup: 컴포넌트 unmount 시 카메라/interval 정리
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach((t) => t.stop());
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // 2️⃣ 한 프레임 캡쳐 + 서버로 전송 + 응답 그림
  const captureAndSendFrame = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (video.readyState !== 4) return; // video 준비 안되면 스킵

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;

    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");

    // 현재 프레임 캡쳐
    ctx.drawImage(video, 0, 0, w, h);

    // 이미지 데이터를 base64로 변환
    const dataUrl = canvas.toDataURL("image/jpeg");

    try {
      const res = await fetch("/api/frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });

      const json = await res.json();

      if (json.faces && Array.isArray(json.faces)) {
        setFaces(json.faces);

        // 프레임 다시 그려서 (혹시 캔버스에 다른 게 그려졌을 수 있으니)
        ctx.drawImage(video, 0, 0, w, h);

        ctx.lineWidth = 2;
        ctx.font = "14px Arial";

        json.faces.forEach((f) => {
          const b = f.bbox || {};
          const x1 = b.x1 || 0;
          const y1 = b.y1 || 0;
          const x2 = b.x2 || 0;
          const y2 = b.y2 || 0;

          // 박스 색: 참여도/토크에 따라 바꿀 수도 있음
          ctx.strokeStyle = f.talk > 0.6 ? "lime" : "yellow";
          ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

          const textLines = [];

          // tid + engagement
          const eng = f.engagement != null ? f.engagement.toFixed(0) : "NA";
          textLines.push(`ID ${f.tid} Eng ${eng}`);

          // talk/focus
          if (f.talk != null && f.focus != null) {
            textLines.push(
              `talk ${f.talk.toFixed(2)}  focus ${f.focus.toFixed(2)}`
            );
          }

          // emotion
          if (f.emotion) {
            const emoProb =
              f.emotion_prob != null ? (f.emotion_prob * 100).toFixed(1) : "";
            textLines.push(`emo ${f.emotion} ${emoProb && emoProb + "%"}`);
          } else if (f.emotion_txt) {
            textLines.push(f.emotion_txt);
          }

          const baseY = Math.max(20, y1 - 5);
          ctx.fillStyle = "black";
          textLines.forEach((line, i) => {
            const y = baseY - i * 18;
            // 글자 배경(가독성용)
            ctx.fillRect(x1, y - 14, ctx.measureText(line).width + 6, 16);
          });

          ctx.fillStyle = "white";
          textLines.forEach((line, i) => {
            const y = baseY - i * 18;
            ctx.fillText(line, x1 + 3, y - 2);
          });
        });
      } else {
        // 얼굴이 하나도 없으면 faces 비움
        setFaces([]);
      }
    } catch (err) {
      console.error("Error sending frame:", err);
    }
  };

  // 3️⃣ Start/Stop 버튼
  const toggleRunning = () => {
    if (!running) {
      setRunning(true);
      // 500ms마다 프레임 전송 (2 FPS 정도)
      intervalRef.current = setInterval(captureAndSendFrame, 500);
    } else {
      setRunning(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
  };

  return (
    <div style={{ padding: "16px", fontFamily: "sans-serif" }}>
      <h1>Live Engagement Analytics Demo</h1>

      {/* 실제로 화면에는 canvas만 보여줌 */}
      <video ref={videoRef} autoPlay playsInline style={{ display: "none" }} />
      <canvas
        ref={canvasRef}
        style={{
          width: "640px",
          height: "480px",
          border: "1px solid #ccc",
        }}
      />

      <div style={{ marginTop: "12px" }}>
        <button onClick={toggleRunning}>
          {running ? "Stop" : "Start"} detection
        </button>
      </div>

      <div style={{ marginTop: "12px" }}>
        <h3>Raw faces JSON</h3>
        <pre style={{ fontSize: "11px", maxHeight: "200px", overflow: "auto" }}>
          {JSON.stringify(faces, null, 2)}
        </pre>
      </div>
    </div>
  );
}

export default App;
