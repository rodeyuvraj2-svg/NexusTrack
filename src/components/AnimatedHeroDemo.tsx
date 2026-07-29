import { AnimatedMarqueeHero } from "@/components/ui/hero-3";

// Reliable Unsplash images (well-known photos guaranteed to exist)
const DEMO_IMAGES = [
  "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&h=600&fit=crop&auto=format",  // movies/cinema
  "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400&h=600&fit=crop&auto=format",  // cinema seat
  "https://images.unsplash.com/photo-1535016120720-40c646be5580?w=400&h=600&fit=crop&auto=format",  // entertainment
  "https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=400&h=600&fit=crop&auto=format",  // media
  "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=400&h=600&fit=crop&auto=format",  // coding/tech
  "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=400&h=600&fit=crop&auto=format",  // city/creative
  "https://images.unsplash.com/photo-1519638399535-1b927e27c3a3?w=400&h=600&fit=crop&auto=format",  // camera
  "https://images.unsplash.com/photo-1522869631980-f289c1b3b180?w=400&h=600&fit=crop&auto=format",  // cinema seats
  "https://images.unsplash.com/photo-1513542789411-6aba482cfea1?w=400&h=600&fit=crop&auto=format",  // creative
  "https://images.unsplash.com/photo-1490730141103-6cac77aa7294?w=400&h=600&fit=crop&auto=format",  // lifestyle
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=600&fit=crop&auto=format",  // portrait
  "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=400&h=600&fit=crop&auto=format",  // teamwork
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=600&fit=crop&auto=format",  // fashion
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=600&fit=crop&auto=format",  // person
  "https://images.unsplash.com/photo-1470071459604-7b8ec44ffd7b?w=400&h=600&fit=crop&auto=format",  // nature
  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&h=600&fit=crop&auto=format",  // forest
];

const AnimatedHeroDemo = () => {
  return (
    <AnimatedMarqueeHero
      tagline="Join over 100,000 happy creators"
      title={
        <>
          Engage Audiences
          <br />
          with Stunning Videos
        </>
      }
      description="Boost Your Brand with High-Impact Short Videos from our expert content creators. Our team is ready to propel your business forward."
      ctaText="Get Started"
      images={DEMO_IMAGES}
    />
  );
};

export default AnimatedHeroDemo;
