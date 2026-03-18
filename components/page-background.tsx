export function PageBackground() {
  return (
    <>
      {/* background image overlay */}
      <div className="fixed inset-0 z-0">
        <div 
          className="w-full h-full"
          style={{
            backgroundImage: 'url(/images/background.webp)',
            backgroundSize: 'cover',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center'
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/40 to-background/60" />
      </div>
    </>
  );
}

