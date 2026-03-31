import buildCardArt from "@/assets/pencil/dev-pages/build-card-art.png";
import deployCardArt from "@/assets/pencil/dev-pages/deploy-card-art.png";
import exploreCardArt from "@/assets/pencil/dev-pages/explore-card-art.png";

export const BUILD_STAGE_IMAGE_SRCS = [exploreCardArt, buildCardArt, deployCardArt] as const;

export const BUILD_STAGES = [
  {
    id: "explore",
    title: "Explore",
    description: "Discover the REST API\nendpoints",
    image: exploreCardArt,
    width: 179,
    height: 179,
  },
  {
    id: "build",
    title: "Build",
    description: "Create real world applications\nwith the SDK",
    image: buildCardArt,
    width: 208,
    height: 186,
  },
  {
    id: "deploy",
    title: "Deploy",
    description: "Publish on Hugging Face\nSpaces",
    image: deployCardArt,
    width: 186,
    height: 173,
  },
] as const;
