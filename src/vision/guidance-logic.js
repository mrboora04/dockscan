// src/vision/guidance-logic.js
import { extractModel } from "./extractors.js";

/**
 * Determines the scanner's state (color and message) based on metrics.
 * @param {object} metrics - Contains motion, text from OCR, etc.
 * @returns {{color: string, text: string}} The state for the UI.
 */
export function getGuidance(metrics) {
  const { motion, txt, ok } = metrics;

  if (motion > 0.08) {
    return { color: "#ef4444", text: "Hold steady" };
  }
  
  if (ok) {
     return { color: "#22c55e", text: "Good to capture..." };
  }

  // Check for any text at all
  if (txt && txt.length > 10) {
    return { color: "#f59e0b", text: "Scanning for key info..." };
  }
  
  return { color: "#ef4444", text: "Aim at label" };
}