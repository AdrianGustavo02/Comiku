import React from 'react'

function Button({ variant = 'primary', children, className = '', ...props }) {
  const base = `${variant === 'primary' ? 'primary-button' : variant === 'secondary' ? 'secondary-button' : 'danger-button'}`
  return (
    <button className={`${base} ${className}`} {...props}>
      {children}
    </button>
  )
}

export default Button
