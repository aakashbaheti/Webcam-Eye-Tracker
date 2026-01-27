# 👁️ Webcam Eye Tracker

A browser-based eye tracking application that uses a webcam to estimate where a user is looking on an image. The system supports **calibration directly on the image**, a **live gaze dot**, and a **heatmap visualization** of visual attention.

> This project is intended for demos, UX studies, and coursework. Webcam-based eye tracking is approximate and not research-grade.

---

## ✨ Features

* Webcam-based eye tracking (no paid hardware)
* Image-based calibration (blue dots appear on the image)
* Live gaze dot overlay
* Heatmap visualization of gaze attention
* Works with uploaded images of any size or aspect ratio

---

## 🛠️ Technology Stack & Languages

**Languages**

* JavaScript (ES6)
* HTML5
* CSS3

**Libraries / Tools**

* WebGazer.js (Brown HCI)
* HTML5 Canvas
* Browser Web APIs (Webcam, DOM)
* VS Code + Live Server

---

## 🚀 How to Run

1. Open the project in **VS Code**
2. Start **Live Server** on `index.html`
3. Allow webcam access in the browser

> Webcam access requires `http://localhost` (opening the file directly will not work).

---

## 🎯 How to Use

1. Click **Start** to begin gaze tracking
2. Click **Calibrate** and stare at each blue dot while clicking it several times
3. Look at the image to see the live gaze dot
4. Click **Show Heatmap** to visualize areas of attention

---

## 🎛️ Accuracy Notes

* Accuracy improves with more calibration clicks
* Gaze smoothing and jitter reduction are applied
* Best results with stable head position and good lighting

---

## ⚠️ Limitations

* Approximate gaze estimation (~1–3 cm screen error)
* Sensitive to lighting and head movement
* Not suitable for medical or research-grade analysis




<img width="1120" height="628" alt="image" src="https://github.com/user-attachments/assets/bf321f89-37c3-4cc8-8269-365c71d97274" />


<img width="1119" height="626" alt="image" src="https://github.com/user-attachments/assets/c3eb2e95-94c4-4f16-b156-beff76c5d029" />



