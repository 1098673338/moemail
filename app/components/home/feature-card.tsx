interface FeatureCardProps { 
  icon: React.ReactNode
  title: string
  description: string 
}

export function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="p-4 rounded border border-gray-300 hover:border-gray-400 transition-colors bg-white/5 backdrop-blur dark:border-gray-700 dark:hover:border-gray-600">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 text-primary p-2">
          {icon}
        </div>
        <div className="text-left">
          <h3 className="font-bold">{title}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
        </div>
      </div>
    </div>
  )
} 
