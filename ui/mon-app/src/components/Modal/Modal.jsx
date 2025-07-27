import { useState } from 'react'
import './Modal.css'

const Modal = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  className = '',
  size = 'medium' // 'small', 'medium', 'large'
}) => {
  const [mouseDownOnOverlay, setMouseDownOnOverlay] = useState(false)

  if (!isOpen) return null

  const handleOverlayMouseDown = (e) => {
    // Only set flag if the mousedown is directly on the overlay (not on modal content)
    if (e.target === e.currentTarget) {
      setMouseDownOnOverlay(true)
    }
  }

  const handleOverlayClick = (e) => {
    // Only close modal if both mousedown and click happened on overlay
    if (e.target === e.currentTarget && mouseDownOnOverlay) {
      onClose()
    }
    setMouseDownOnOverlay(false)
  }

  return (
    <div 
      className="modal-overlay" 
      onMouseDown={handleOverlayMouseDown}
      onClick={handleOverlayClick}
    >
      <div 
        className={`modal-content modal-${size} ${className}`} 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  )
}

export default Modal
