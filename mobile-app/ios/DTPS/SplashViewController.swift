import UIKit

class SplashViewController: UIViewController {

    // MARK: - Properties

    private var logoImageView: UIImageView!
    private var textLabel: UILabel!
    private var pillContainerView: UIView!
    private var glowView: UIView!
    private var textContainerView: UIView!
    private var pillWidthConstraint: NSLayoutConstraint?

    private let tealColor = UIColor(red: 59/255, green: 167/255, blue: 150/255, alpha: 1.0)
    private let greenColor = UIColor(red: 97/255, green: 160/255, blue: 53/255, alpha: 1.0)

    /// Called when splash is ready to be removed (animation done + page loaded)
    var onReadyToTransition: (() -> Void)?

    private var animationFinished = false
    private var hasTransitioned = false
    /// Maximum time the splash can stay on screen before auto-dismissing
    private var maxDisplayTimer: Timer?
    private let maxSplashDuration: TimeInterval = 5.0

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        startAnimation()

        // Safety net: auto-dismiss splash after max duration even if animation
        // callback didn't fire (prevents indefinite loading on reviewers' devices)
        maxDisplayTimer = Timer.scheduledTimer(withTimeInterval: maxSplashDuration, repeats: false) { [weak self] _ in
            guard let self = self else { return }
            print("[DTPS] Splash max duration reached — force dismissing")
            self.animationFinished = true
            self.checkTransition()
        }
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .darkContent }

    deinit {
        maxDisplayTimer?.invalidate()
        NotificationCenter.default.removeObserver(self)
    }

    private func checkTransition() {
        guard animationFinished, !hasTransitioned else { return }
        hasTransitioned = true
        maxDisplayTimer?.invalidate()
        onReadyToTransition?()
    }

    // MARK: - UI Setup

    private func setupUI() {
        view.backgroundColor = .white

        // Subtle gradient background
        let gradient = CAGradientLayer()
        gradient.frame = view.bounds
        gradient.colors = [
            greenColor.withAlphaComponent(0.1).cgColor,
            UIColor.white.cgColor,
            tealColor.withAlphaComponent(0.1).cgColor
        ]
        gradient.startPoint = CGPoint(x: 0, y: 0)
        gradient.endPoint = CGPoint(x: 1, y: 1)
        view.layer.insertSublayer(gradient, at: 0)

        // Glow circle
        glowView = UIView()
        glowView.translatesAutoresizingMaskIntoConstraints = false
        glowView.backgroundColor = greenColor.withAlphaComponent(0.2)
        glowView.layer.cornerRadius = 144
        glowView.layer.shadowColor = greenColor.cgColor
        glowView.layer.shadowRadius = 60
        glowView.layer.shadowOpacity = 0.5
        glowView.layer.shadowOffset = .zero
        view.addSubview(glowView)

        // Pill container (teal rounded rect, starts 80x80 = circle)
        pillContainerView = UIView()
        pillContainerView.translatesAutoresizingMaskIntoConstraints = false
        pillContainerView.backgroundColor = tealColor
        pillContainerView.layer.cornerRadius = 40
        pillContainerView.clipsToBounds = true
        pillContainerView.layer.shadowColor = UIColor.black.cgColor
        pillContainerView.layer.shadowRadius = 25
        pillContainerView.layer.shadowOpacity = 0.25
        pillContainerView.layer.shadowOffset = CGSize(width: 0, height: 12)
        view.addSubview(pillContainerView)

        // Logo
        logoImageView = UIImageView()
        logoImageView.translatesAutoresizingMaskIntoConstraints = false
        logoImageView.contentMode = .scaleAspectFill
        logoImageView.backgroundColor = .white
        logoImageView.layer.cornerRadius = 40
        logoImageView.clipsToBounds = true
        logoImageView.alpha = 0
        logoImageView.transform = CGAffineTransform(scaleX: 0.5, y: 0.5)

        if let logo = UIImage(named: "Logo") {
            logoImageView.image = logo
        } else {
            let lbl = UILabel()
            lbl.text = "DTPS"
            lbl.font = .systemFont(ofSize: 20, weight: .bold)
            lbl.textColor = tealColor
            lbl.translatesAutoresizingMaskIntoConstraints = false
            logoImageView.addSubview(lbl)
            NSLayoutConstraint.activate([
                lbl.centerXAnchor.constraint(equalTo: logoImageView.centerXAnchor),
                lbl.centerYAnchor.constraint(equalTo: logoImageView.centerYAnchor)
            ])
        }
        pillContainerView.addSubview(logoImageView)

        // Text container
        textContainerView = UIView()
        textContainerView.translatesAutoresizingMaskIntoConstraints = false
        textContainerView.clipsToBounds = true
        pillContainerView.addSubview(textContainerView)

        // Text label
        textLabel = UILabel()
        textLabel.translatesAutoresizingMaskIntoConstraints = false
        textLabel.text = "DTPS"
        textLabel.font = .systemFont(ofSize: 32, weight: .bold)
        textLabel.textColor = .white
        textLabel.alpha = 0
        textContainerView.addSubview(textLabel)

        // Layout
        pillWidthConstraint = pillContainerView.widthAnchor.constraint(equalToConstant: 80)
        NSLayoutConstraint.activate([
            glowView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            glowView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            glowView.widthAnchor.constraint(equalToConstant: 288),
            glowView.heightAnchor.constraint(equalToConstant: 288),

            pillContainerView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            pillContainerView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            pillContainerView.heightAnchor.constraint(equalToConstant: 80),
            pillWidthConstraint!,

            logoImageView.leadingAnchor.constraint(equalTo: pillContainerView.leadingAnchor),
            logoImageView.topAnchor.constraint(equalTo: pillContainerView.topAnchor),
            logoImageView.bottomAnchor.constraint(equalTo: pillContainerView.bottomAnchor),
            logoImageView.widthAnchor.constraint(equalTo: logoImageView.heightAnchor),

            textContainerView.leadingAnchor.constraint(equalTo: logoImageView.trailingAnchor),
            textContainerView.trailingAnchor.constraint(equalTo: pillContainerView.trailingAnchor),
            textContainerView.topAnchor.constraint(equalTo: pillContainerView.topAnchor),
            textContainerView.bottomAnchor.constraint(equalTo: pillContainerView.bottomAnchor),

            textLabel.centerYAnchor.constraint(equalTo: textContainerView.centerYAnchor),
            textLabel.leadingAnchor.constraint(equalTo: textContainerView.leadingAnchor, constant: 16)
        ])
    }

    // MARK: - Animation

    private func startAnimation() {
        // Phase 1 – pop in the logo (fast: 0.5s)
        UIView.animate(withDuration: 0.5, delay: 0, usingSpringWithDamping: 0.65, initialSpringVelocity: 0.5, options: [], animations: {
            self.logoImageView.alpha = 1
            self.logoImageView.transform = .identity
        }) { _ in
            self.expandPill()
        }
    }

    private func expandPill() {
        // Phase 2 – expand pill from 80 → 220, reveal text (fast: 0.4s + 0.25s)
        pillWidthConstraint?.constant = 220
        UIView.animate(withDuration: 0.4, delay: 0, usingSpringWithDamping: 0.8, initialSpringVelocity: 0.3, options: [], animations: {
            self.view.layoutIfNeeded()
        })
        UIView.animate(withDuration: 0.25, delay: 0.2, options: [], animations: {
            self.textLabel.alpha = 1
        }) { _ in
            // Brief hold so the branding is visible, then signal done
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
                self?.animationFinished = true
                self?.checkTransition()
            }
        }
    }
}
