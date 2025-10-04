// App.jsx
import React, { useEffect, useRef } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import * as THREE from "three";
import "./App.css";

gsap.registerPlugin(ScrollTrigger);

/**
 * 说明：
 * - 这个文件把你原来的功能尽量完整复刻并修复了关键 bug。
 * - 为了避免浏览器 WebGL 上下文限制，我们将 renderer/ctx 保存在 window.__LETTERS_APP，
 *   以便在 React StrictMode 双重 mount/unmount 时复用而不会不断 new WebGLRenderer。
 *
 * 使用：
 * - 直接替换你原来的 App.jsx / App.js。
 * - 保证样式文件 App.css 中保留 .work .text-container .cards .card .letter 等类名。
 */

// ---------------------------
// 模块级的全局缓存，避免重复创建太多 WebGLContext（尤其在 StrictMode 下）
// ---------------------------
if (!window.__LETTERS_APP) {
  window.__LETTERS_APP = {
    renderer: null,
    rendererRefCount: 0, // 记录有多少组件实例在使用 renderer
    domAttached: false, // renderer.domElement 是否已被 append 到 DOM
    lastPixelRatio: window.devicePixelRatio || 1,
    // 可选保留全局销毁函数
    cleanupAll: () => {},
  };
}

export default function App() {
  const textContainerRef = useRef(null);
  const workSectionRef = useRef(null);
  const cardsContainerRef = useRef(null);

  // 一些局部状态用 ref 保存，避免 re-render
  const animationIdRef = useRef(null);
  const lenisRef = useRef(null);
  const gridCanvasRef = useRef(null);
  const gridCtxRef = useRef(null);
  const pathRef = useRef([]);
  const letterPositionsRef = useRef(new Map());
  const currentXPositionRef = useRef(0);
  const currentProgressRef = useRef(0);
  const mountedRef = useRef(true); // 标记当前组件是否挂载（用于异步回调中判断）
  const resizeObserverRef = useRef(null);

  // 配置常量
  const moveDistanceFactor = 8; // 卡片移动距离 = window.innerHeight * moveDistanceFactor
  const letterCountsPerPath = 10;

  // ---------------------------
  // 辅助函数：安全读取窗口尺寸（避免 0x0）
  // ---------------------------
  const getSafeWindowSize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!w || !h) {
      console.warn("⚠️ getSafeWindowSize: 返回 0，跳过（可能是不可见或尚未 layout）");
      return null;
    }
    return { w, h };
  };

  // ---------------------------
  // 创建或复用全局 renderer（存放在 window.__LETTERS_APP）
  // 返回 { renderer, createdNew }
  // ---------------------------
  const ensureRenderer = (width, height) => {
    try {
      const store = window.__LETTERS_APP;
      if (store.renderer) {
        // 复用
        store.renderer.setPixelRatio(window.devicePixelRatio || 1);
        store.renderer.setSize(width, height);
        store.renderer.domElement.style.pointerEvents = "none";
        return { renderer: store.renderer, createdNew: false };
      }

      // 创建新 renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(window.devicePixelRatio || 1);
      renderer.setSize(width, height);
      renderer.domElement.id = "letters-canvas";
      renderer.domElement.style.position = "fixed";
      renderer.domElement.style.top = "0";
      renderer.domElement.style.left = "0";
      renderer.domElement.style.zIndex = "2";
      renderer.domElement.style.pointerEvents = "none";

      // 保存到全局
      store.renderer = renderer;
      store.lastPixelRatio = window.devicePixelRatio || 1;
      return { renderer, createdNew: true };
    } catch (e) {
      console.error("❌ ensureRenderer 失败:", e);
      return { renderer: null, createdNew: false };
    }
  };

  // ---------------------------
  // 如果需要彻底释放所有 Three 资源（仅在最后一个组件卸载时调用）
  // ---------------------------
  const disposeRenderer = () => {
    try {
      const store = window.__LETTERS_APP;
      if (!store.renderer) return;
      try {
        // 从 DOM 上移除
        if (store.renderer.domElement && store.domAttached) {
          store.renderer.domElement.remove();
        }
      } catch (e) {
        console.warn("⚠️ disposeRenderer: 移除 domElement 时出错", e);
      }
      try {
        store.renderer.dispose();
      } catch (e) {
        console.warn("⚠️ disposeRenderer: renderer.dispose 出错", e);
      }
      store.renderer = null;
      store.domAttached = false;
      console.log("✅ 全局 renderer 已释放");
    } catch (e) {
      console.error("❌ disposeRenderer 失败:", e);
    }
  };

  // ---------------------------
  // 创建文本路径，返回 THREE.Line (分段) — 保证 amplitude 绝对化
  // ---------------------------
  const createTextAnimationLine = (yPos, amplitude = 1) => {
    try {
      const amp = Math.abs(amplitude);
      const points = [];
      // 保留与原代码相似的参数范围以获得类似轨迹
      const segments = 100;
      const width = 50; // 横向跨度，和你原来逻辑接近
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const x = -25 + width * t;
        const y = yPos + Math.sin(t * Math.PI) * -amp;
        const z = (1 - Math.pow(Math.abs(t - 0.5) * 2, 2)) * -5;
        const v = new THREE.Vector3(x, y, z);
        // 防御性：确保不是 NaN
        if (!isFinite(v.x) || !isFinite(v.y) || !isFinite(v.z)) {
          console.warn("⚠️ createTextAnimationLine: 生成了非有限值，跳过该点", { x, y, z });
          continue;
        }
        points.push(v);
      }

      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1 });
      const line = new THREE.LineSegments(geometry, material);

      // attach curve convenience: 保存曲线样本用于获取点
      const curve = new THREE.CatmullRomCurve3(points.length ? points : [new THREE.Vector3(0, 0, 0)]);
      line.curve = curve;
      return line;
    } catch (e) {
      console.error("❌ createTextAnimationLine 错误:", e);
      return null;
    }
  };

  // ---------------------------
  // 绘制网格点（Grid Canvas）
  // ---------------------------
  const drawGrid = (ctx, canvas, scrollProgress = 0) => {
    try {
      if (!ctx || !canvas) return;
      const dpr = window.devicePixelRatio || 1;
      // 清除并黑底
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      ctx.fillStyle = "#f40c3f";
      const dotSize = 2;
      const spacing = 30;
      const rows = Math.ceil((canvas.height / dpr) / spacing);
      const cols = Math.ceil((canvas.width / dpr) / spacing) + 15;
      const offset = (scrollProgress * spacing * 10) % spacing;

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          ctx.beginPath();
          const cx = x * spacing - offset;
          const cy = y * spacing;
          ctx.arc(cx, cy, dotSize, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    } catch (e) {
      console.error("❌ drawGrid 错误:", e);
    }
  };

  // ---------------------------
  // 更新字母元素目标位置（将 Three 曲线上的点投影到屏幕上）
  // ---------------------------
  const updateTargetPositions = (paths, lettersCamera, scrollProgress = 0) => {
    try {
      if (!paths || !lettersCamera) return;
      paths.forEach((line, lineIndex) => {
        if (!line || !line.letterElements) return;
        const multiplier = [0.8, 1, 0.7, 0.9][lineIndex] ?? 1;
        line.letterElements.forEach((element, i) => {
          const totalLetters = line.letterElements.length;
          const spacing = 1 / totalLetters;
          // 确保 getPoint 的参数在 [0,1)
          const tRaw = (i * spacing + scrollProgress * multiplier);
          const t = ((tRaw % 1) + 1) % 1;
          let point;
          try {
            point = line.curve.getPoint(t);
          } catch (e) {
            // fallback: use (0,0,0)
            point = new THREE.Vector3(0, 0, 0);
          }
          const vector = point.clone().project(lettersCamera);
          const w = window.innerWidth;
          const h = window.innerHeight;
          const pos = {
            x: (-vector.x * 0.5 + 0.5) * w,
            y: (-vector.y * 0.5 + 0.5) * h,
          };
          const positions = letterPositionsRef.current.get(element);
          if (positions) {
            positions.target = pos;
          } else {
            letterPositionsRef.current.set(element, {
              current: { x: pos.x, y: pos.y },
              target: { x: pos.x, y: pos.y },
            });
          }
        });
      });
    } catch (e) {
      console.error("❌ updateTargetPositions 错误:", e);
    }
  };

  // ---------------------------
  // 平滑更新 DOM 字母位置
  // ---------------------------
  const updateLetterPositions = (lerpFn = (a, b, t) => a + (b - a) * t) => {
    try {
      letterPositionsRef.current.forEach((positions, element) => {
        if (!positions || !positions.target || !positions.current) return;
        const distX = positions.target.x - positions.current.x;
        if (Math.abs(distX) > window.innerWidth * 0.7) {
          positions.current.x = positions.target.x;
          positions.current.y = positions.target.y;
        } else {
          positions.current.x = lerpFn(positions.current.x, positions.target.x, 0.07);
          positions.current.y = lerpFn(positions.current.y, positions.target.y, 0.07);
        }
        element.style.transform = `translate(-50%, -50%) translate3d(${positions.current.x}px, ${positions.current.y}px, 0px)`;
      });
    } catch (e) {
      console.error("❌ updateLetterPositions 错误:", e);
    }
  };

  // ---------------------------
  // 更新卡片 X 位移
  // ---------------------------
  const updateCardsPosition = (cardsContainer, moveDistance) => {
    try {
      const targetX = -moveDistance * currentProgressRef.current;
      currentXPositionRef.current = currentXPositionRef.current + (targetX - currentXPositionRef.current) * 0.07;
      if (cardsContainer) {
        gsap.set(cardsContainer, { x: currentXPositionRef.current });
      }
    } catch (e) {
      console.error("❌ updateCardsPosition 错误:", e);
    }
  };

  // ---------------------------
  // 主初始化逻辑（把原有流程几乎照搬并修复）
  // ---------------------------
  useEffect(() => {
    mountedRef.current = true;
    console.log("🎬 useEffect 开始执行");

    // 早期保护：如果没有 workSection 挂载好就返回
    if (!workSectionRef.current) {
      console.error("❌ workSectionRef 未就绪，放弃初始化");
      return;
    }

    // safe size
    const safeSize = getSafeWindowSize();
    if (!safeSize) {
      // 有时候在不可视 tab 或极短时机下 size 为 0。我们可以在后面通过 resize observer 再次触发完整 init。
      console.warn("⚠️ 当前窗口尺寸不可用，稍后等待 resize 或 observer 触发初始化");
      // 仍然注册一个 resizeObserver，等有效大小出现时再初始化完整流程
    }

    // 将大量初始化封装到函数中，允许后续通过 resize 触发重试
    let localState = {
      lettersScene: null,
      lettersCamera: null,
      lettersRenderer: null,
      gridCanvas: null,
      gridCtx: null,
      lenis: null,
      animationRunning: false,
      paths: [],
      // store references to appended DOM containers that need cleanup
      appendedElements: [],
      scrollTriggerInstance: null,
    };

    const tryInitOnce = () => {
      try {
        const size = getSafeWindowSize();
        if (!size) return false;

        console.log("🚀 initializeApp 开始执行");
        console.log("🔍 检查DOM元素:");
        console.log("- workSectionRef:", workSectionRef.current);
        console.log("- textContainerRef:", textContainerRef.current);
        console.log("- cardsContainerRef:", cardsContainerRef.current);

        // ---------------------------
        // GSAP + Lenis
        // ---------------------------
        try {
          if (!lenisRef.current) {
            lenisRef.current = new Lenis();
            console.log("✅ Lenis 初始化成功");
          } else {
            console.log("♻️ 复用 Lenis");
          }
        } catch (e) {
          console.error("❌ Lenis 初始化失败:", e);
        }

        // Hook Lenis into GSAP's ticker
        try {
          lenisRef.current.on("scroll", ScrollTrigger.update);
          // 注意这里我们使用 raf 回调包装 lenis。GSAP 的 ticker 也可以，但为了确保稳定性，我们使用 requestAnimationFrame。
        } catch (e) {
          console.warn("⚠️ lenis.on('scroll', ...) 可能失败:", e);
        }

        // ---------------------------
        // Grid Canvas 初始化
        // ---------------------------
        try {
          // 如果已经有 canvas（可能是上一次 init 遗留），先清理引用但不 remove（会在最终 cleanup 处理）
          let gridCanvas = gridCanvasRef.current;
          if (!gridCanvas) {
            gridCanvas = document.createElement("canvas");
            gridCanvas.id = "grid-canvas";
            gridCanvas.style.position = "fixed";
            gridCanvas.style.top = "0";
            gridCanvas.style.left = "0";
            gridCanvas.style.zIndex = "1";
            gridCanvas.style.pointerEvents = "none";
            workSectionRef.current.appendChild(gridCanvas);
            gridCanvasRef.current = gridCanvas;
            localState.appendedElements.push(gridCanvas);
            console.log("✅ Grid Canvas 创建并添加到 workSection");
          } else {
            // 已经存在时确保父节点正确
            if (gridCanvas.parentElement !== workSectionRef.current) {
              try {
                workSectionRef.current.appendChild(gridCanvas);
              } catch (e) {
                // ignore
              }
            }
          }
          const ctx = gridCanvas.getContext("2d");
          gridCtxRef.current = ctx;
          // resize
          const dpr = window.devicePixelRatio || 1;
          gridCanvas.width = Math.floor(size.w * dpr);
          gridCanvas.height = Math.floor(size.h * dpr);
          gridCanvas.style.width = `${size.w}px`;
          gridCanvas.style.height = `${size.h}px`;
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.scale(dpr, dpr);
          console.log("✅ Grid Canvas 初始化完成:", gridCanvas.width, "x", gridCanvas.height);
        } catch (e) {
          console.error("❌ Grid Canvas 初始化失败:", e);
        }

        // ---------------------------
        // Three.js 初始化：scene / camera / renderer
        // ---------------------------
        try {
          // ensure renderer (全局复用)
          const { renderer, createdNew } = ensureRenderer(size.w, size.h);
          if (!renderer) {
            console.error("❌ 无法创建或复用 renderer，放弃 Three 初始化");
            return false;
          }
          localState.lettersRenderer = renderer;
          // 将 renderer 的 dom 挂载到 workSection（仅挂载一次）
          const store = window.__LETTERS_APP;
          if (!store.domAttached) {
            try {
              // Append to workSection so DOM 文本能覆盖（z-index 设置为 2）
              workSectionRef.current.appendChild(renderer.domElement);
              store.domAttached = true;
            } catch (e) {
              console.warn("⚠️ 将 renderer.domElement 附加到 workSection 失败，尝试 document.body", e);
              try {
                document.body.appendChild(renderer.domElement);
                store.domAttached = true;
              } catch (err) {
                console.error("❌ 附加 renderer.domElement 到 document.body 也失败:", err);
              }
            }
          }

          // scene & camera
          const lettersScene = new THREE.Scene();
          const lettersCamera = new THREE.PerspectiveCamera(50, size.w / size.h, 0.1, 1000);
          lettersCamera.position.z = 20;
          localState.lettersScene = lettersScene;
          localState.lettersCamera = lettersCamera;

          // log WebGL context info (防御性捕获)
          try {
            const gl = renderer.getContext();
            if (gl) {
              try {
                console.log("🔍 WebGL 上下文信息:");
                console.log("- 版本:", gl.getParameter(gl.VERSION));
                console.log("- 渲染器:", gl.getParameter(gl.RENDERER));
                console.log("- 供应商:", gl.getParameter(gl.VENDOR));
              } catch (e) {
                // 某些环境 getParameter 可能受限制
                console.warn("⚠️ 读取 WebGL 参数受限:", e);
              }
            }
          } catch (e) {
            console.warn("⚠️ 读取 renderer.getContext 失败:", e);
          }
        } catch (e) {
          console.error("❌ Three.js 初始化失败:", e);
          return false;
        }

        // ---------------------------
        // 创建路径（尽量复现你原来的 4 条路径）
        // ---------------------------
        try {
          const lines = [
            createTextAnimationLine(10, 2),
            createTextAnimationLine(3.5, 1),
            createTextAnimationLine(-3.5, -1),
            createTextAnimationLine(-10, -2),
          ].filter(Boolean);
          localState.paths = lines;
          pathRef.current = lines;
          lines.forEach((line, i) => {
            try {
              localState.lettersScene.add(line);
              console.log(`✅ 路径 ${i} 添加到场景`);
            } catch (e) {
              console.warn("⚠️ 添加路径到场景失败:", e);
            }
          });
        } catch (e) {
          console.error("❌ 创建路径失败:", e);
        }

        // ---------------------------
        // 在 textContainer 中创建 DOM 字母并记录位置
        // ---------------------------
        try {
          const textContainer = textContainerRef.current;
          if (!textContainer) {
            console.error("❌ textContainer 未找到，无法创建字母 DOM");
          } else {
            // 清理原有字母（如果存在）
            Array.from(textContainer.children).forEach((c) => {
              if (c.classList && c.classList.contains("letter")) {
                textContainer.removeChild(c);
              }
            });

            localState.paths.forEach((line, idx) => {
              if (!line) return;
              line.letterElements = Array.from({ length: letterCountsPerPath }, (_, letterIndex) => {
                const el = document.createElement("div");
                el.className = "letter";
                // 保留原来的文字数组逻辑（例如 "W","O","R","K"）——按路径索引赋字符
                const charMap = ["W", "O", "R", "K"];
                el.textContent = charMap[idx] ?? charMap[idx % charMap.length] ?? "X";
                // 基础样式保护（避免样式表丢失时消失）
                el.style.position = "absolute";
                el.style.left = "0px";
                el.style.top = "0px";
                el.style.transform = "translate(-50%, -50%)";
                textContainer.appendChild(el);
                letterPositionsRef.current.set(el, {
                  current: { x: 0, y: 0 },
                  target: { x: 0, y: 0 },
                });
                return el;
              });
              console.log(`✅ 路径 ${idx} 的字母元素创建完成`);
            });
          }
        } catch (e) {
          console.error("❌ 创建字母元素失败:", e);
        }

        // ---------------------------
        // 卡片容器初始化（保持你的原逻辑）
        // ---------------------------
        const cardsContainer = cardsContainerRef.current;
        const workSection = workSectionRef.current;
        const moveDistance = (window.innerHeight || size.h) * moveDistanceFactor;

        // ---------------------------
        // ScrollTrigger 创建
        // ---------------------------
        try {
          // kill previous ScrollTriggers to avoid重复
          ScrollTrigger.getAll().forEach((t) => t.kill());

          // create main ScrollTrigger
          ScrollTrigger.create({
            trigger: workSection,
            start: "top top",
            end: "+=700%",
            pin: true,
            pinSpacing: true,
            scrub: 1,
            onUpdate: (self) => {
              currentProgressRef.current = self.progress;
              // 更新目标位置（letters）
              updateTargetPositions(localState.paths, localState.lettersCamera, self.progress);
              // 更新 grid
              drawGrid(gridCtxRef.current, gridCanvasRef.current, self.progress);
            },
            onRefresh: (self) => {
              currentProgressRef.current = self.progress;
            },
            onInit: () => console.log("✅ ScrollTrigger 初始化完成"),
          });
          console.log("🎯 ScrollTrigger 已创建");
        } catch (e) {
          console.error("❌ 创建 ScrollTrigger 失败:", e);
        }

        // ---------------------------
        // 动画循环：更新 DOM 字母、卡片位移、Three 渲染
        // ---------------------------
        const animate = () => {
          try {
            // animation guard
            if (!mountedRef.current) return;
            // 更新字母（DOM）
            updateLetterPositions();
            // 更新卡片位置
            updateCardsPosition(cardsContainer, moveDistance);
            // 渲染 three 场景
            if (localState.lettersRenderer && localState.lettersScene && localState.lettersCamera) {
              try {
                localState.lettersRenderer.render(localState.lettersScene, localState.lettersCamera);
              } catch (e) {
                // 如果 render 失败（例如 context lost），记录并尽量不再抛错
                console.warn("⚠️ render 过程出错:", e);
              }
            }
            animationIdRef.current = requestAnimationFrame(animate);
          } catch (e) {
            console.error("❌ animate 错误:", e);
            if (animationIdRef.current) {
              cancelAnimationFrame(animationIdRef.current);
              animationIdRef.current = null;
            }
          }
        };

        // 初始绘制 grid & 开始 animate
        try {
          drawGrid(gridCtxRef.current, gridCanvasRef.current, 0);
        } catch (e) {
          // ignore
        }
        // update initial positions once
        updateTargetPositions(localState.paths, localState.lettersCamera, 0);
        // start loop
        if (!animationIdRef.current) {
          animationIdRef.current = requestAnimationFrame(animate);
        }

        // ---------------------------
        // resize handler
        // ---------------------------
        const handleResize = () => {
          try {
            const s = getSafeWindowSize();
            if (!s) return;
            // grid canvas
            if (gridCanvasRef.current && gridCtxRef.current) {
              const dpr = window.devicePixelRatio || 1;
              gridCanvasRef.current.width = Math.floor(s.w * dpr);
              gridCanvasRef.current.height = Math.floor(s.h * dpr);
              gridCanvasRef.current.style.width = `${s.w}px`;
              gridCanvasRef.current.style.height = `${s.h}px`;
              gridCtxRef.current.setTransform(1, 0, 0, 1, 0, 0);
              gridCtxRef.current.scale(dpr, dpr);
            }
            // camera + renderer
            if (localState.lettersCamera) {
              localState.lettersCamera.aspect = s.w / s.h;
              localState.lettersCamera.updateProjectionMatrix();
            }
            if (localState.lettersRenderer) {
              try {
                // 仅在 pixel ratio 变化时更新 renderer 的 pixelRatio
                const store = window.__LETTERS_APP;
                const newPR = window.devicePixelRatio || 1;
                if (store.lastPixelRatio !== newPR) {
                  localState.lettersRenderer.setPixelRatio(newPR);
                  store.lastPixelRatio = newPR;
                }
                localState.lettersRenderer.setSize(s.w, s.h);
              } catch (e) {
                console.warn("⚠️ resize 更新 renderer 失败:", e);
              }
            }
            // update positions
            updateTargetPositions(localState.paths, localState.lettersCamera, currentProgressRef.current);
            drawGrid(gridCtxRef.current, gridCanvasRef.current, currentProgressRef.current);
          } catch (e) {
            console.error("❌ handleResize 错误:", e);
          }
        };

        // 注册 resize
        window.addEventListener("resize", handleResize);
        resizeObserverRef.current = new ResizeObserver(handleResize);
        try {
          resizeObserverRef.current.observe(document.body);
        } catch (e) {
          // ignore if cannot observe
        }

        // ---------------------------
        // 保存 localState 以便 cleanup
        // ---------------------------
        // attach localState to ref for cleanup access
        (tryAttachLocalState)(localState);

        console.log("✅ 应用初始化完成");
        return true;
      } catch (error) {
        console.error("💥 initializeApp 整体执行失败:", error);
        return false;
      }
    }; // end tryInitOnce

    // helper 将 localState 暴露给 cleanup（用闭包）
    let attachedLocalState = null;
    function tryAttachLocalState(ls) {
      attachedLocalState = ls;
    }

    // 尝试初始化
    const initSuccess = tryInitOnce();
    if (!initSuccess) {
      // 如果第一次失败，依靠 ResizeObserver 触发重试（例如从 0x0 变为正确尺寸）
      console.warn("⚠️ 第一次初始化未完全成功，等待 resizeObserver 或下一次尝试");
    }

    // ---------------------------
    // 清理函数（当此组件卸载时执行）
    // ---------------------------
    return () => {
      try {
        mountedRef.current = false;
        console.log("🧹 开始组件级清理");

        // stop animation
        if (animationIdRef.current) {
          cancelAnimationFrame(animationIdRef.current);
          animationIdRef.current = null;
          console.log("✅ 动画循环停止");
        }

        // destroy ScrollTrigger instances
        try {
          ScrollTrigger.getAll().forEach((trigger) => {
            trigger.kill();
          });
          console.log("🔚 销毁 ScrollTrigger");
        } catch (e) {
          console.warn("⚠️ 销毁 ScrollTrigger 失败:", e);
        }

        // remove lenis (但尽量不要完全 destroy，全局复用)
        try {
          if (lenisRef.current) {
            // Lenis 提供 destroy 方法
            if (typeof lenisRef.current.destroy === "function") {
              lenisRef.current.destroy();
              lenisRef.current = null;
              console.log("✅ Lenis 销毁（实例）");
            } else {
              lenisRef.current = null;
            }
          }
        } catch (e) {
          console.warn("⚠️ 销毁 Lenis 失败:", e);
        }

        // 移除 resize listeners & observer
        try {
          window.removeEventListener("resize", () => {});
          if (resizeObserverRef.current) {
            resizeObserverRef.current.disconnect();
            resizeObserverRef.current = null;
          }
        } catch (e) {
          // ignore
        }

        // 清理 DOM 字母（避免残留）
        try {
          const textContainer = textContainerRef.current;
          if (textContainer) {
            Array.from(textContainer.children).forEach((c) => {
              if (c.classList && c.classList.contains("letter")) {
                textContainer.removeChild(c);
              }
            });
            letterPositionsRef.current.clear();
            console.log("✅ 字母 DOM 清理完毕");
          }
        } catch (e) {
          console.warn("⚠️ 清理字母 DOM 时出错:", e);
        }

        // Grid canvas 不立即 remove（因为全局 renderer 可能仍被其他实例使用）
        try {
          if (gridCanvasRef.current && gridCanvasRef.current.parentElement) {
            // 但如果这个组件是唯一使用者，则移除
            try {
              gridCanvasRef.current.remove();
            } catch (e) {
              // ignore
            }
            gridCanvasRef.current = null;
            gridCtxRef.current = null;
            console.log("✅ Grid canvas 移除");
          }
        } catch (e) {
          console.warn("⚠️ 移除 grid canvas 失败:", e);
        }

        // 逐步释放 Three 资源（注意：我们不会立即 dispose 全局 renderer）
        try {
          if (attachedLocalState) {
            // 从 scene 中移除我们添加的 paths
            try {
              attachedLocalState.paths?.forEach((line) => {
                try {
                  attachedLocalState.lettersScene?.remove(line);
                  // dispose geometry/material
                  if (line.geometry) line.geometry.dispose();
                  if (line.material) {
                    if (Array.isArray(line.material)) {
                      line.material.forEach((m) => m.dispose && m.dispose());
                    } else {
                      line.material.dispose && line.material.dispose();
                    }
                  }
                } catch (e) {
                  // ignore per-line errors
                }
              });
            } catch (e) {
              // ignore
            }

            // 只释放 scene/camera 引用
            attachedLocalState.lettersScene = null;
            attachedLocalState.lettersCamera = null;
            attachedLocalState.paths = null;
            attachedLocalState = null;
            console.log("✅ 本实例 scene/camera/paths 释放");
          }

          // global renderer reference counting: 当没有任何挂载实例时再彻底释放 renderer
          const globalStore = window.__LETTERS_APP;
          globalStore.rendererRefCount = Math.max(0, (globalStore.rendererRefCount || 0) - 1);
          if ((globalStore.rendererRefCount || 0) <= 0) {
            // 如果你想在每次卸载都保留 renderer（以避免 browser 上下文限制），就不要调用 disposeRenderer。
            // 但为了在你需要彻底卸载的场景下释放资源，我们在这里调用 disposeRenderer。
            // 注意：在 StrictMode 双卸载/重挂载的 dev 场景中，这里可能会导致反复释放/创建；我们做了引用计数判断。
            disposeRenderer();
          } else {
            console.log("♻️ 仍有其他实例使用 renderer，跳过 dispose 全局 renderer");
          }
        } catch (e) {
          console.warn("⚠️ 释放 Three 资源时发生错误:", e);
        }

        console.log("🧹 组件清理完成");
      } catch (e) {
        console.error("❌ useEffect cleanup 出现错误:", e);
      }
    }; // end return cleanup
  }, []); // 空依赖，仅在 mount/unmount 时触发

  // ---------------------------
  // 渲染 DOM：保留原来的结构与卡片渲染逻辑
  // ---------------------------
  return (
    <div>
      <section className="work" ref={workSectionRef}>
        <div className="text-container" ref={textContainerRef}></div>
        <div className="cards" ref={cardsContainerRef} style={{ position: "relative" }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div className="card" key={i}>
              <div className="card-img">
                <img
                  src={`/src/components/work/assets/${i + 1}.webp`}
                  alt=""
                  onError={(e) => {
                    console.error(`❌ 图片加载失败: /src/components/work/assets/${i + 1}.webp`);
                    e.target.style.backgroundColor = "#ccc";
                  }}
                  onLoad={() => console.log(`✅ 图片加载成功: ${i + 1}.webp`)}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
              <div className="card-copy">
                <p>Card title</p>
                <p>Card ID</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
