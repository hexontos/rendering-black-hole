<h1 align="center">🌌⚫💫 Rendering Black Hole</h1>
<p align="center"><em>A recreational programming project with no vibe coding and built from scratch.</em></p>

<p align="center">
  <img src="./docs/media/blackhole_render.gif" alt="Black Hole GIF" width="1000">
</p>

## 📖 About
<p>The project is an experimental render of a black hole, where gravity bends space around itself so much that even reflected light becomes visibly distorted in space.</p>

<p>If we place a black hole in front of a star, it distorts the light from it so much that it looks like it bends the star and carves itself into it. 
If we add a disc ring of hot matter around the black hole, it bends the light coming from it such that it displays a new ring on a new axis and has a second inner ring.</p>

## ✨ Motivation
<p>As a newcomer to front-end, I wanted to build something advanced, but still small in scope. For years, I wanted to write ray tracing program, 3d scene, and physics simulation + do it from scratch, without library. After getting blessed by the algorithm gods, I found a few projects about black hole renders done in C++, and that became the perfect match. <span style="font-weight: 600;">I go deeper about the development and core concepts here:</span> <a href="./docs/explanation.md">📘 This link does not bite.</a></p>

## ▶ How to run it?

```bash
npm run build
```
<p>Then you will find it in <code>/dist</code>.</p>

<p>Or you can run it live:</p>

```bash
npm install
npm run dev # starts the build/watch loop and serves the app through live-server.
```

## 🗺 Next steps

<p><big>The project is pretty much done for me, but these are some improvements I might do in the future:</big></p>

<small>
1. Rewrite the CPU pipeline into WASM (AssemblyScript), including the grid.<br>
2. Add translucency and movement to the disc.<br>
3. Add textures and reflections to objects, plus an orbiting system.<br>
4. Cache rendered objects for a speed improvement.<br>
5. Add a simple scene editor UI.<br>
</small>

## 📚 References
<small>

- [Kavan's video](https://www.youtube.com/watch?v=_YbGWoUaZg0) (his [repository](https://github.com/kavan010/black_hole))
- [Tony's simple ray tracer](https://tony1324.github.io/raytracer/) (I believe there was a video, but I cannot find it)
- [About Runge-Kutta](https://web.mit.edu/10.001/Web/Course_Notes/Differential_Equations_Notes/node5.html)
- [Polar coords](https://en.wikipedia.org/wiki/Polar_coordinate_system)
- [Useful article about intro with webGPU](https://matthewmacfarquhar.medium.com/webgpu-rendering-part-1-basic-triangle-b6a1ed654b05)
- [Example of code calculation](https://threejsroadmap.com/blog/raytracing-a-black-hole-with-webgpu)
- [Awesome and daunting pdf from NASA](https://d2pn8kiwq2w21t.cloudfront.net/documents/black_hole_math_83vNud3.pdf)

</small>
