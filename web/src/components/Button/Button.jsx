import './Button.css'

export default function Button({ variant = 'primary', size = 'md', children, onClick }) {
  return (
    <button className={`button button--${variant} button--${size}`} onClick={onClick}>
      {children}
    </button>
  )
}
