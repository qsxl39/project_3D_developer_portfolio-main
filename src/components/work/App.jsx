import React, { useEffect, useRef } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import * as THREE from "three";
import "./App.css";

export default function App() {
  const textContainerRef = useRef(null);
  const workSectionRef = useRef(null);
  const cardsContainerRef = useRef(null);

  useEffect(() => {
    let lettersScene = null;
    let lettersCamera = null;
    let lettersRenderer = null;
    let gridCanvas = null;
    let gridCtx = null;
    let path = [];
    let letterPositions = new Map();
    let currentXPosition = 0;
    let animationId = null;
    let lenis = null;
    let currentProgress = 0; // 添加进度跟踪

    const initializeApp = () => {
      gsap.registerPlugin(ScrollTrigger);

      // 初始化 Lenis 平滑滚动
      lenis = new Lenis();

      // 使用现代方式集成 Lenis 和 ScrollTrigger
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);

      const workSection = workSectionRef.current;
      const cardsContainer = cardsContainerRef.current;
      const moveDistance = window.innerHeight * 8;
      const lerp = (start, end, t) => start + (end - start) * t;

      // Grid Canvas
      gridCanvas = document.createElement("canvas");
      gridCanvas.id = "grid-canvas";
      workSection.appendChild(gridCanvas);
      gridCtx = gridCanvas.getContext("2d");

      const resizeGridCanvas = () => {
        const dpr = window.devicePixelRatio || 1;
        gridCanvas.width = window.innerWidth * dpr;
        gridCanvas.height = window.innerHeight * dpr;
        gridCanvas.style.width = window.innerWidth + "px";
        gridCanvas.style.height = window.innerHeight + "px";
        gridCtx.setTransform(1, 0, 0, 1, 0, 0);
        gridCtx.scale(dpr, dpr);
      };
      resizeGridCanvas();

      const drawGrid = (scrollProgress = 0) => {
        gridCtx.fillStyle = "black";
        gridCtx.fillRect(0, 0, gridCanvas.width, gridCanvas.height);
        gridCtx.fillStyle = "#f40c3f";
        const dotSize = 1;
        const spacing = 30;
        const rows = Math.ceil(gridCanvas.height / spacing);
        const cols = Math.ceil(gridCanvas.width / spacing) + 15;
        const offset = (scrollProgress * spacing * 10) % spacing;
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            gridCtx.beginPath();
            gridCtx.arc(x * spacing - offset, y * spacing, dotSize, 0, Math.PI * 2);
            gridCtx.fill();
          }
        }
      };

      // Three.js 场景
      lettersScene = new THREE.Scene();
      lettersCamera = new THREE.PerspectiveCamera(
        50,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
      );
      lettersCamera.position.z = 20;

      lettersRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      lettersRenderer.setSize(window.innerWidth, window.innerHeight);
      lettersRenderer.setClearColor(0x000000, 0);
      lettersRenderer.setPixelRatio(window.devicePixelRatio);
      lettersRenderer.domElement.id = "letters-canvas";
      workSection.appendChild(lettersRenderer.domElement);

      const createTextAnimationPath = (yPos, amplitude) => {
        const points = [];
        for (let i = 0; i <= 20; i++) {
          const t = i / 20;
          points.push(
            new THREE.Vector3(
              -25 + 50 * t,
              yPos + Math.sin(t * Math.PI) * -amplitude,
              (1 - Math.pow(Math.abs(t - 0.5) * 2, 2)) * -5
            )
          );
        }
        const curve = new THREE.CatmullRomCurve3(points);
        const line = new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints(curve.getPoints(100)),
          new THREE.LineBasicMaterial({ color: 0x000, linewidth: 1 })
        );
        line.curve = curve;
        return line;
      };

      path = [
        createTextAnimationPath(10, 2),
        createTextAnimationPath(3.5, 1),
        createTextAnimationPath(-3.5, -1),
        createTextAnimationPath(-10, -2),
      ];
      path.forEach((line) => lettersScene.add(line));

      const textContainer = textContainerRef.current;
      path.forEach((line, i) => {
        line.letterElements = Array.from({ length: 10 }, () => {
          const el = document.createElement("div");
          el.className = "letter";
          el.textContent = ["W", "O", "R", "K"][i];
          textContainer.appendChild(el);
          letterPositions.set(el, {
            current: { x: 0, y: 0 },
            target: { x: 0, y: 0 },
          });
          return el;
        });
      });

      const lineSpeedMultipliers = [0.8, 1, 0.7, 0.9];
      const updateTargetPositions = (scrollProgress = 0) => {
        path.forEach((line, lineIndex) => {
          line.letterElements.forEach((element, i) => {
            const totalLetters = line.letterElements.length;
            const spacing = 1 / totalLetters;
            const point = line.curve.getPoint(
              (i * spacing + scrollProgress * lineSpeedMultipliers[lineIndex]) % 1
            );
            const vector = point.clone().project(lettersCamera);
            const positions = letterPositions.get(element);
            positions.target = {
              x: (-vector.x * 0.5 + 0.5) * window.innerWidth,
              y: (-vector.y * 0.5 + 0.5) * window.innerHeight,
            };
          });
        });
      };

      const updateLetterPositions = () => {
        letterPositions.forEach((positions, element) => {
          const distX = positions.target.x - positions.current.x;
          if (Math.abs(distX) > window.innerWidth * 0.7) {
            positions.current.x = positions.target.x;
            positions.current.y = positions.target.y;
          } else {
            positions.current.x = lerp(positions.current.x, positions.target.x, 0.07);
            positions.current.y = lerp(positions.current.y, positions.target.y, 0.07);
          }
          element.style.transform = `translate(-50%, -50%) translate3d(${positions.current.x}px, ${positions.current.y}px, 0px)`;
        });
      };

      const updateCardsPosition = () => {
        const targetX = -moveDistance * currentProgress;
        currentXPosition = lerp(currentXPosition, targetX, 0.07);
        gsap.set(cardsContainer, { x: currentXPosition });
      };

      const animate = () => {
        updateLetterPositions();
        updateCardsPosition();
        lettersRenderer.render(lettersScene, lettersCamera);
        animationId = requestAnimationFrame(animate);
      };

      // 创建 ScrollTrigger
      ScrollTrigger.create({
        trigger: workSection,
        start: "top top",
        end: "+=700%",
        pin: true,
        pinSpacing: true,
        scrub: 1,
        onUpdate: (self) => {
          currentProgress = self.progress; // 更新当前进度
          updateTargetPositions(self.progress);
          drawGrid(self.progress);
        },
        onRefresh: (self) => {
          currentProgress = self.progress; // 页面刷新时也更新进度
        }
      });

      drawGrid(0);
      animate();
      updateTargetPositions(0);

      const handleResize = () => {
        resizeGridCanvas();
        drawGrid(currentProgress);
        lettersCamera.aspect = window.innerWidth / window.innerHeight;
        lettersCamera.updateProjectionMatrix();
        lettersRenderer.setSize(window.innerWidth, window.innerHeight);
        updateTargetPositions(currentProgress);
      };
      window.addEventListener("resize", handleResize);

      // 清理函数
      return () => {
        if (animationId) cancelAnimationFrame(animationId);
        if (lenis) lenis.destroy();
        window.removeEventListener("resize", handleResize);
        ScrollTrigger.getAll().forEach(trigger => trigger.kill());
        gsap.ticker.remove((time) => lenis.raf(time * 1000));
      };
    };

    const cleanup = initializeApp();
    return cleanup;
  }, []);

  return (
    <div>
      <section className="intro">
        <h1>(Intro)</h1>
      </section>
      <section className="work" ref={workSectionRef}>
        <div className="text-container" ref={textContainerRef}></div>
        <div className="cards" ref={cardsContainerRef}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div className="card" key={i}>
              <div className="card-img">
                <img src={`/src/components/work/assets/${i + 1}.webp`} alt="" />
              </div>
              <div className="card-copy">
                <p>Card title</p>
                <p>Card ID</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="outro">
        <h1>(Outro)</h1>
      </section>
    </div>
  );
}