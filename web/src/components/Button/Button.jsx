import './Button.css'

export default function Button({ children, onClick }) {
  return (
    <button className="button-primary" onClick={onClick}>
      {children}
    </button>
  )
}
