import './Button.css'

export default function Button({ children, onClick, variant = "primary" }) {
  return (
    <button className={`button-${variant}`} onClick={onClick}>
      {children}
    </button>
  )
}
